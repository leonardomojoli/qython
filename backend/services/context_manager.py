"""
Enterprise-grade Context Window Management for Qython AI

Handles multi-tier context strategy:
- Tier 1: Full context (800k tokens)
- Tier 2: Smart summarization (>800k)
- Tier 3: Rolling summaries (extreme cases)

Best practices from OpenAI, Anthropic, Google.
"""

import logging
from typing import List, Dict, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import desc
import tiktoken

from ..models import ChatMessage
from ..config import Config
from google import genai
from google.genai import types

logger = logging.getLogger("qython_logger")

# Gemini 2.0 Flash Limits
GEMINI_MAX_INPUT_TOKENS = 1_000_000
MAX_CONTEXT_TOKENS = 800_000  # 80% of capacity (safety margin)
SUMMARIZATION_THRESHOLD = 800_000
SUMMARY_TARGET_TOKENS = 400_000  # Compress to 50%
MAX_MESSAGE_FETCH = 100  # DB optimization


class ContextWindowManager:
    """
    Manages conversation context with intelligent truncation and summarization.
    """
    
    def __init__(self, client: genai.Client):
        self.client = client
        self.encoding = tiktoken.get_encoding("cl100k_base")  # Same as GPT-4
        
    def count_tokens(self, text: str) -> int:
        """Accurate token counting using tiktoken"""
        return len(self.encoding.encode(text))
    
    async def get_managed_context(
        self,
        session_id: int,
        db: AsyncSession,
        max_tokens: int = MAX_CONTEXT_TOKENS
    ) -> tuple[List[Dict], int]:
        """
        Get conversation context managed by token limits.
        
        Returns:
            (formatted_messages, total_tokens)
        """
        # Fetch recent messages with DB optimization
        result = await db.execute(
            select(ChatMessage)
            .filter(ChatMessage.session_id == session_id)
            .order_by(desc(ChatMessage.timestamp))
            .limit(MAX_MESSAGE_FETCH)
        )
        messages_desc = result.scalars().all()
        messages_chrono = list(reversed(messages_desc))
        
        if not messages_chrono:
            return [], 0
        
        # Count total tokens
        total_tokens = sum(self.count_tokens(msg.content) for msg in messages_chrono)
        
        logger.info(f"[CONTEXT] Session {session_id}: {len(messages_chrono)} msgs, ~{total_tokens} tokens")
        
        # Tier 1: Full context (most common)
        if total_tokens <= max_tokens:
            formatted = [{"sender": msg.sender, "content": msg.content} for msg in messages_chrono]
            return formatted, total_tokens
        
        # Tier 2: Smart summarization
        logger.warning(f"[CONTEXT] Session {session_id} exceeds {max_tokens} tokens. Applying smart summarization.")
        return await self._apply_smart_summarization(
            messages_chrono, 
            session_id,
            db,
            max_tokens
        )
    
    async def _apply_smart_summarization(
        self,
        messages: List[ChatMessage],
        session_id: int,
        db: AsyncSession,
        max_tokens: int
    ) -> tuple[List[Dict], int]:
        """
        Apply smart summarization: summarize old half, keep recent full.
        """
        # Check for cached summary
        from ..models import ConversationSummary
        result = await db.execute(
            select(ConversationSummary)
            .filter(ConversationSummary.session_id == session_id)
            .order_by(desc(ConversationSummary.created_at))
            .limit(1)
        )
        cached_summary = result.scalars().first()
        
        # Split messages: old (to summarize) vs recent (keep full)
        split_point = len(messages) // 2
        old_messages = messages[:split_point]
        recent_messages = messages[split_point:]
        
        # Generate or use cached summary
        if cached_summary and cached_summary.messages_up_to >= len(old_messages):
            summary_text = cached_summary.summary_text
            summary_tokens = cached_summary.token_count or self.count_tokens(summary_text)
            logger.info(f"[CONTEXT] Using cached summary (~{summary_tokens} tokens)")
        else:
            summary_text = await self._generate_clinical_summary(old_messages)
            summary_tokens = self.count_tokens(summary_text)
            
            # Cache the summary
            await self._cache_summary(session_id, summary_text, len(old_messages), summary_tokens, db)
            logger.info(f"[CONTEXT] Generated new summary (~{summary_tokens} tokens)")
        
        # Build context: [SUMMARY] + recent messages
        formatted_context = [
            {"sender": "system", "content": f"[RESUMO DO CONTEXTO ANTERIOR]\\n{summary_text}"}
        ]
        
        # Add recent messages within token budget
        remaining_tokens = max_tokens - summary_tokens
        recent_tokens = 0
        
        for msg in recent_messages:
            msg_tokens = self.count_tokens(msg.content)
            if recent_tokens + msg_tokens > remaining_tokens:
                logger.warning(f"[CONTEXT] Truncated recent messages at token limit")
                break
            formatted_context.append({"sender": msg.sender, "content": msg.content})
            recent_tokens += msg_tokens
        
        total_tokens = summary_tokens + recent_tokens
        return formatted_context, total_tokens
    
    async def _generate_clinical_summary(self, messages: List[ChatMessage]) -> str:
        """
        Generate structured clinical summary of conversation history.
        """
        # Format conversation for summarization
        conversation_text = "\\n\\n".join([
            f"{'PACIENTE' if msg.sender == 'user' else 'QYTHON'}: {msg.content}"
            for msg in messages
        ])
        
        prompt = f"""Você é um assistente médico especializado em resumir discussões clínicas.

Resuma a conversa abaixo preservando TODOS os detalhes clinicamente relevantes:
- Queixas e sintomas principais
- Histórico médico mencionado
- Exames discutidos ou solicitados
- Diagnósticos considerados (diferenciais)
- Tratamentos e medicações recomendadas
- Decisões clínicas importantes
- Follow-up planejado

CONVERSA ORIGINAL:
{conversation_text}

RESUMO CLÍNICO ESTRUTURADO (máximo 2000 palavras):"""
        
        try:
            response = self.client.models.generate_content(
                model=f'models/{Config.PRIMARY_LLM_MODEL}',
                contents=prompt,
                config=types.GenerateContentConfig(
                    max_output_tokens=3000,
                    temperature=0.3  # Low temp for factual accuracy
                )
            )
            return response.text
        except Exception as e:
            logger.error(f"[CONTEXT] Summary generation failed: {e}")
            # Fallback: simple truncation
            return f"[Resumo indisponível. Primeiras {len(messages)} mensagens truncadas por limite de contexto.]"
    
    async def _cache_summary(
        self,
        session_id: int,
        summary_text: str,
        messages_up_to: int,
        token_count: int,
        db: AsyncSession
    ):
        """Cache generated summary in database"""
        from ..models import ConversationSummary
        
        new_summary = ConversationSummary(
            session_id=session_id,
            summary_text=summary_text,
            messages_up_to=messages_up_to,
            token_count=token_count
        )
        db.add(new_summary)
        await db.commit()
        logger.info(f"[CONTEXT] Cached summary for session {session_id}")
