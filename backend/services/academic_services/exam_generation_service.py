# qython/backend/services/academic_services/exam_generation_service.py

import logging
import json
import re
import os
from .. import llm_services
from google.genai import types
from types import SimpleNamespace
from ...models import ArenaExam

logger = logging.getLogger("qython_logger")

def _load_exam_context(context_filename: str) -> str:
    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    context_path = os.path.join(backend_dir, 'exam_contexts', context_filename)
    
    logger.info(f"Carregando contexto do exame de: {context_path}")
    if not os.path.exists(context_path):
        logger.error(f"Arquivo de contexto não encontrado: {context_path}")
        return ""
    try:
        with open(context_path, 'r', encoding='utf-8') as f:
            return f.read()
    except Exception as e:
        logger.error(f"Erro ao ler o arquivo de contexto {context_path}: {e}")
        return ""

def generate_exam(exam: ArenaExam, user_id: int) -> tuple:
    logger.info(f"Iniciando geração de simulado para o exame '{exam.exam_code}' para o usuário {user_id}.")

    exam_context = _load_exam_context(exam.context_filename)
    if not exam_context:
        raise RuntimeError(f"Não foi possível carregar o contexto para o exame {exam.exam_code}. A geração não pode continuar.")

    prompt = f"""
    **PERSONA:** Você é um especialista sênior na elaboração de provas de residência médica, especificamente para o exame **{exam.title} ({exam.country})**.

    **TAREFA CRÍTICA:** Gerar um conjunto de **100 questões** de múltipla escolha que sejam **extremamente fiéis** ao estilo, formato, nível de dificuldade e temas abordados no exame real.

    **CONTEXTO DE REFERÊNCIA OBRIGATÓRIO:** Para guiar sua criação, analise cuidadosamente o seguinte bloco de texto, que contém exemplos de questões reais do exame **{exam.title}**. Você DEVE usar este contexto para entender:
    1.  **Estilo da Vinheta Clínica:** O tamanho e a complexidade dos casos clínicos.
    2.  **Nível de Dificuldade:** A profundidade do conhecimento exigido.
    3.  **Formato das Alternativas:** O quão plausíveis são os distratores.
    4.  **Temas Prevalentes:** Os assuntos que mais aparecem.

    **REGRAS ESTRUTURAIS:**
    1.  **Idioma:** Gere o exame inteiramente em **{exam.language}**.
    2.  **Formato:** Todas as questões DEVEM ter **exatamente 5 alternativas (A, B, C, D, E)**. **Distratores HOMOGÊNEOS:** as 5 alternativas devem ter comprimento, estrutura e nível técnico parecidos — a correta NÃO pode se destacar por ser a mais longa ou elaborada (senão o aluno acerta pela "cara" da resposta, sem saber o conteúdo). Cada distrator deve ser plausível (um equívoco real e comum), exigindo domínio do CONCEITO para ser descartado.
    3.  **Fidelidade:** As questões geradas NÃO DEVEM ser cópias das do contexto, mas sim novas questões que poderiam perfeitamente estar na prova real.
    4.  **Formato de Saída:** A resposta DEVE ser um único objeto JSON contendo uma chave "questionario_objetivo", que é uma lista de 100 objetos de questão. Cada objeto deve ter as chaves: "pergunta", "alternativas", "resposta_correta", e "justificativa".

    **INSTRUÇÃO FINAL:** Sua resposta inteira deve ser um único bloco de código JSON. Não inclua "```json" no início ou "```" no final. Sua resposta deve começar com `{{` e terminar com `}}`.

    ---
    **CONTEXTO COM EXEMPLOS DE QUESTÕES REAIS ({exam.title}):**
    {exam_context}
    ---
    """

    model_name = llm_services.PRIMARY_LLM_MODEL
    try:
        response = llm_services.client.models.generate_content(
            model=f'models/{model_name}',
            contents=llm_services._redact_llm_contents(prompt),
            config=types.GenerateContentConfig(
                temperature=0.5,
                max_output_tokens=32768,
                response_mime_type="application/json"
            )
        )
        
        # Use json.loads (safe) instead of demjson3 (accepts Python expressions)
        text = response.text.strip()
        # Strip markdown code block if present
        if text.startswith('```'):
            text = re.sub(r'^```(?:json)?\s*', '', text)
            text = re.sub(r'\s*```$', '', text)
        parsed_json = json.loads(text)
        usage = response.usage_metadata
        
        logger.info(f"Exame '{exam.exam_code}' gerado com sucesso com {len(parsed_json.get('questionario_objetivo', []))} questões.")
        return parsed_json, usage, model_name

    except Exception as e:
        logger.error(f"Falha ao gerar questões para o exame '{exam.exam_code}': {e}", exc_info=True)
        raise RuntimeError(f"Erro na comunicação com o serviço de IA durante a geração das questões de {exam.title}.")