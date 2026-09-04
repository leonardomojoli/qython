# qython/backend/services/settings_service.py

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from ..models import User, UserAnamnesisTemplate

async def get_user_preferences(db: AsyncSession, user_id: int):
    # Esta função agora precisa do 'db' para fazer a query.
    result = await db.execute(select(User).filter(User.id == user_id))
    user = result.scalars().first()
    
    if user:
        return {
            "theme_preference": user.theme_preference,
            "language_preference": user.language_preference,
            "autosave_consultation_drafts": user.autosave_consultation_drafts
        }
    return None

async def update_user_preferences(db: AsyncSession, user_id: int, theme_preference=None, language_preference=None, autosave_consultation_drafts=None):
    result = await db.execute(select(User).filter(User.id == user_id))
    user = result.scalars().first()
    
    if not user:
        return False, None # Retorna False e None para indicar falha

    if theme_preference is not None:
        user.theme_preference = theme_preference
    if language_preference is not None:
        user.language_preference = language_preference
    if autosave_consultation_drafts is not None:
        user.autosave_consultation_drafts = autosave_consultation_drafts

    await db.commit()
    await db.refresh(user) # Atualiza o objeto user com os dados do banco
    return True, user # Retorna True e o objeto usuário atualizado

async def get_all_user_anamnesis_templates(db: AsyncSession, user_id: int):
    result = await db.execute(select(UserAnamnesisTemplate).filter_by(user_id=user_id))
    templates = result.scalars().all()
    
    return [{
        "specialty": t.specialty,
        "consultation_type": t.consultation_type,
        "content": t.content
    } for t in templates]

async def create_or_update_anamnesis_template(db: AsyncSession, user_id: int, specialty: str, consultation_type: str, content: str):
    result = await db.execute(
        select(UserAnamnesisTemplate).filter_by(
            user_id=user_id,
            specialty=specialty,
            consultation_type=consultation_type
        )
    )
    template = result.scalars().first()

    if template:
        template.content = content
        created = False
    else:
        template = UserAnamnesisTemplate(
            user_id=user_id,
            specialty=specialty,
            consultation_type=consultation_type,
            content=content
        )
        db.add(template)
        created = True
    
    await db.commit()
    await db.refresh(template)
    return template, created

async def delete_anamnesis_template(db: AsyncSession, user_id: int, specialty: str, consultation_type: str):
    result = await db.execute(
        select(UserAnamnesisTemplate).filter_by(
            user_id=user_id,
            specialty=specialty,
            consultation_type=consultation_type
        )
    )
    template = result.scalars().first()

    if template:
        await db.delete(template)
        await db.commit()
        return True
    return False