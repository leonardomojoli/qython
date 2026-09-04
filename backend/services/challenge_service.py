# qython/backend/services/challenge_service.py
"""
Arena Challenge Service
Handles head-to-head challenges between users.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from ..models import ArenaChallenge, User

logger = logging.getLogger("qython_logger")

# Challenge expires after 24 hours
CHALLENGE_EXPIRY_HOURS = 24


async def create_challenge(
    challenger: User,
    opponent_username: str,
    exam_code: str,
    exam_name: str,
    db: AsyncSession
) -> Dict:
    """
    Create a new challenge. Finds opponent by @username.
    Returns challenge data or error.
    """
    # Normalize username (remove @ if present)
    opponent_username = opponent_username.lstrip('@').lower()
    
    # Can't challenge yourself
    if challenger.username and challenger.username.lower() == opponent_username:
        return {"success": False, "error": "Você não pode desafiar a si mesmo."}
    
    # Find opponent by username
    result = await db.execute(
        select(User).filter(User.username.ilike(opponent_username))
    )
    opponent = result.scalars().first()
    
    if not opponent:
        return {"success": False, "error": f"Usuário @{opponent_username} não encontrado."}
    
    # Check if opponent has Arena access (optional - allow challenges anyway)
    
    # Check for existing pending challenge between these users for this exam
    existing = await db.execute(
        select(ArenaChallenge).filter(
            and_(
                ArenaChallenge.challenger_id == challenger.id,
                ArenaChallenge.opponent_id == opponent.id,
                ArenaChallenge.exam_code == exam_code,
                ArenaChallenge.status == 'pending'
            )
        )
    )
    if existing.scalars().first():
        return {"success": False, "error": "Você já tem um desafio pendente com este usuário para este exame."}
    
    # Create challenge
    challenge = ArenaChallenge(
        challenger_id=challenger.id,
        opponent_id=opponent.id,
        opponent_username=opponent.username or opponent_username,
        exam_code=exam_code,
        exam_name=exam_name,
        status='pending',
        expires_at=datetime.now(timezone.utc) + timedelta(hours=CHALLENGE_EXPIRY_HOURS)
    )
    
    db.add(challenge)
    await db.commit()
    await db.refresh(challenge)
    
    logger.info(f"Challenge created: {challenger.email} vs @{opponent_username} for {exam_code}")
    
    return {
        "success": True,
        "challenge": {
            "id": challenge.id,
            "opponent_name": opponent.full_name,
            "opponent_username": opponent.username,
            "exam_name": exam_name,
            "expires_at": challenge.expires_at.isoformat()
        }
    }


async def get_my_challenges(user: User, db: AsyncSession) -> Dict:
    """Get all challenges for a user (sent and received)"""
    
    # Challenges I sent
    sent_query = await db.execute(
        select(ArenaChallenge)
        .filter(ArenaChallenge.challenger_id == user.id)
        .order_by(ArenaChallenge.created_at.desc())
        .limit(20)
    )
    sent = sent_query.scalars().all()
    
    # Challenges I received
    received_query = await db.execute(
        select(ArenaChallenge)
        .filter(ArenaChallenge.opponent_id == user.id)
        .order_by(ArenaChallenge.created_at.desc())
        .limit(20)
    )
    received = received_query.scalars().all()
    
    def format_challenge(c: ArenaChallenge, is_sender: bool) -> Dict:
        return {
            "id": c.id,
            "exam_code": c.exam_code,
            "exam_name": c.exam_name,
            "status": c.status,
            "is_sender": is_sender,
            "opponent_username": c.opponent_username if is_sender else None,
            "challenger_score": c.challenger_score,
            "opponent_score": c.opponent_score,
            "winner_id": c.winner_id,
            "is_winner": c.winner_id == user.id if c.winner_id else None,
            "created_at": c.created_at.isoformat(),
            "expires_at": c.expires_at.isoformat()
        }
    
    return {
        "sent": [format_challenge(c, True) for c in sent],
        "received": [format_challenge(c, False) for c in received],
        "pending_count": len([c for c in received if c.status == 'pending'])
    }


async def respond_to_challenge(
    user: User,
    challenge_id: int,
    accept: bool,
    db: AsyncSession
) -> Dict:
    """Accept or decline a challenge"""
    
    result = await db.execute(
        select(ArenaChallenge).filter(
            and_(
                ArenaChallenge.id == challenge_id,
                ArenaChallenge.opponent_id == user.id,
                ArenaChallenge.status == 'pending'
            )
        )
    )
    challenge = result.scalars().first()
    
    if not challenge:
        return {"success": False, "error": "Desafio não encontrado ou já respondido."}
    
    # Check if expired
    if datetime.now(timezone.utc) > challenge.expires_at:
        challenge.status = 'expired'
        await db.commit()
        return {"success": False, "error": "Este desafio expirou."}
    
    if accept:
        challenge.status = 'accepted'
        message = "Desafio aceito! Agora vocês dois precisam completar o simulado."
    else:
        challenge.status = 'declined'
        message = "Desafio recusado."
    
    await db.commit()
    
    return {"success": True, "message": message, "status": challenge.status}


async def submit_challenge_score(
    user: User,
    challenge_id: int,
    score: int,
    db: AsyncSession
) -> Dict:
    """Submit a score for a challenge after completing the quiz"""
    
    result = await db.execute(
        select(ArenaChallenge).filter(
            and_(
                ArenaChallenge.id == challenge_id,
                ArenaChallenge.status == 'accepted',
                or_(
                    ArenaChallenge.challenger_id == user.id,
                    ArenaChallenge.opponent_id == user.id
                )
            )
        )
    )
    challenge = result.scalars().first()
    
    if not challenge:
        return {"success": False, "error": "Desafio não encontrado ou não aceito."}
    
    # Set the appropriate score
    if challenge.challenger_id == user.id:
        if challenge.challenger_score is not None:
            return {"success": False, "error": "Você já submeteu sua pontuação."}
        challenge.challenger_score = score
    else:
        if challenge.opponent_score is not None:
            return {"success": False, "error": "Você já submeteu sua pontuação."}
        challenge.opponent_score = score
    
    # Check if both have submitted - determine winner
    if challenge.challenger_score is not None and challenge.opponent_score is not None:
        challenge.status = 'completed'
        challenge.completed_at = datetime.now(timezone.utc)
        
        if challenge.challenger_score > challenge.opponent_score:
            challenge.winner_id = challenge.challenger_id
        elif challenge.opponent_score > challenge.challenger_score:
            challenge.winner_id = challenge.opponent_id
        # Tie = no winner
    
    await db.commit()
    
    return {
        "success": True,
        "challenger_score": challenge.challenger_score,
        "opponent_score": challenge.opponent_score,
        "status": challenge.status,
        "winner_id": challenge.winner_id
    }


async def expire_old_challenges(db: AsyncSession) -> int:
    """Expire challenges that have passed their deadline. Called by scheduler."""
    result = await db.execute(
        select(ArenaChallenge).filter(
            and_(
                ArenaChallenge.status.in_(['pending', 'accepted']),
                ArenaChallenge.expires_at < datetime.now(timezone.utc)
            )
        )
    )
    challenges = result.scalars().all()
    
    count = 0
    for challenge in challenges:
        challenge.status = 'expired'
        count += 1
    
    if count > 0:
        await db.commit()
        logger.info(f"Expired {count} old challenges")
    
    return count
