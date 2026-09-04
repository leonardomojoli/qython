# qython/backend/models.py

import enum
from datetime import datetime, timezone
from sqlalchemy import (
    BigInteger, Boolean, Column, DateTime, Enum, Float, ForeignKey, Integer, LargeBinary,
    String, Text, UniqueConstraint, JSON, Table, Index
)
from sqlalchemy.dialects.postgresql import INET, JSONB
from sqlalchemy.ext.mutable import MutableDict
from sqlalchemy.orm import relationship
from .db_base import Base
from .services.encryption_service import EncryptedString, EncryptedJSON

user_exam_enrollment = Table('user_exam_enrollment', Base.metadata,
    Column('user_id', Integer, ForeignKey('users.id'), primary_key=True),
    Column('exam_id', Integer, ForeignKey('arena_exams.id'), primary_key=True)
)

class ArenaExam(Base):
    __tablename__ = 'arena_exams'

    id = Column(Integer, primary_key=True)
    exam_code = Column(String(50), unique=True, nullable=False, index=True)
    title_key = Column(String(100), nullable=False)
    country = Column(String(100))
    flag = Column(String(10))
    description_key = Column(Text)
    language = Column(String(10), default='pt-BR')
    context_filename = Column(String(100), nullable=False)

    enrolled_users = relationship("User", secondary=user_exam_enrollment, back_populates="enrolled_exams")

    def __repr__(self):
        return f"<ArenaExam {self.exam_code}>"


# League tier constants.
# ⚠️ UI de tiers REMOVIDA (jul/2026, decisão do fundador: conceito confuso p/ usuário).
# Mantido no backend só p/ compat de API com builds mobile antigos + matchmaking interno
# (find_random_opponent pareia por tier adjacente). Não reintroduzir tiers na interface.
LEAGUE_TIERS = [
    {'name': 'bronze',    'display': 'Bronze',    'icon': '🥉', 'min_xp': 0},
    {'name': 'silver',    'display': 'Prata',     'icon': '🥈', 'min_xp': 500},
    {'name': 'gold',      'display': 'Ouro',      'icon': '🥇', 'min_xp': 1500},
    {'name': 'platinum',  'display': 'Platina',   'icon': '💎', 'min_xp': 3500},
    {'name': 'diamond',   'display': 'Diamante',  'icon': '💠', 'min_xp': 7000},
    {'name': 'champion',  'display': 'Campeão',   'icon': '👑', 'min_xp': 15000},
]


class UserXpProfile(Base):
    """Central XP tracking per user. Effort-based ranking (Duolingo-style)."""
    __tablename__ = 'user_xp_profiles'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False, unique=True)

    # Lifetime XP (never resets)
    total_xp = Column(Integer, default=0, nullable=False)

    # Season XP (resets at season transition)
    season_xp = Column(Integer, default=0, nullable=False)

    # Streak tracking
    current_streak = Column(Integer, default=0, nullable=False)
    longest_streak = Column(Integer, default=0, nullable=False)
    last_activity_date = Column(DateTime(timezone=True), nullable=True)

    # League tier
    league_tier = Column(String(20), default='bronze', nullable=False, index=True)

    # Current season reference
    season_id = Column(Integer, ForeignKey('arena_seasons.id'), nullable=True)
    season_rank = Column(Integer, nullable=True)
    season_percentile = Column(Integer, nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                       onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="xp_profile")
    season = relationship("ArenaSeason")

    def __repr__(self):
        return f"<UserXpProfile user={self.user_id} xp={self.total_xp} tier={self.league_tier}>"


class XpTransaction(Base):
    """Audit log of all XP earned. Full transparency."""
    __tablename__ = 'xp_transactions'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    season_id = Column(Integer, ForeignKey('arena_seasons.id'), nullable=True)

    amount = Column(Integer, nullable=False)
    source = Column(String(30), nullable=False)  # quiz_base, accuracy_bonus, streak_bonus, etc.

    quiz_attempt_id = Column(Integer, ForeignKey('quiz_attempts.id'), nullable=True)
    challenge_id = Column(Integer, ForeignKey('arena_challenges.id'), nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    user = relationship("User")

    def __repr__(self):
        return f"<XpTransaction user={self.user_id} +{self.amount} source={self.source}>"


class ArenaSeason(Base):
    """Bimonthly arena seasons for competitions"""
    __tablename__ = 'arena_seasons'

    id = Column(Integer, primary_key=True)
    name = Column(String(50), nullable=False)  # "Jan-Fev 2026"
    start_date = Column(DateTime(timezone=True), nullable=False)
    end_date = Column(DateTime(timezone=True), nullable=False)
    is_active = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    rankings = relationship("SeasonRanking", back_populates="season", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<ArenaSeason {self.name}>"

class SeasonRanking(Base):
    """User rankings within a season for a specific exam"""
    __tablename__ = 'season_rankings'

    id = Column(Integer, primary_key=True)
    season_id = Column(Integer, ForeignKey('arena_seasons.id', ondelete='CASCADE'), nullable=False)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    exam_code = Column(String(50), nullable=False, index=True)
    total_score = Column(Integer, default=0)
    total_xp = Column(Integer, default=0)  # XP-based ranking (effort)
    quizzes_completed = Column(Integer, default=0)
    rank_position = Column(Integer)
    percentile = Column(Integer)  # Top 5% = 5
    league_tier = Column(String(20), default='bronze')
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint('season_id', 'user_id', 'exam_code', name='uq_season_user_exam'),
    )

    season = relationship("ArenaSeason", back_populates="rankings")
    user = relationship("User", back_populates="season_rankings")

    def __repr__(self):
        return f"<SeasonRanking User {self.user_id} Season {self.season_id} Exam {self.exam_code}>"

class ArenaChallenge(Base):
    """Head-to-head challenges between users"""
    __tablename__ = 'arena_challenges'

    id = Column(Integer, primary_key=True)
    challenger_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    opponent_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=True)  # Null until opponent found
    opponent_username = Column(String(30), nullable=False)  # @username of opponent
    exam_code = Column(String(50), nullable=False)
    exam_name = Column(String(100), nullable=False)
    
    # Status: pending, accepted, declined, completed, expired
    status = Column(String(20), default='pending', index=True)
    
    # Scores (set after quiz completion)
    challenger_score = Column(Integer, nullable=True)
    opponent_score = Column(Integer, nullable=True)
    challenger_xp = Column(Integer, nullable=True)
    opponent_xp = Column(Integer, nullable=True)
    winner_id = Column(Integer, ForeignKey('users.id'), nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    expires_at = Column(DateTime(timezone=True), nullable=False)  # 24h from creation
    completed_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    challenger = relationship("User", foreign_keys=[challenger_id], backref="challenges_sent")
    opponent = relationship("User", foreign_keys=[opponent_id], backref="challenges_received")
    winner = relationship("User", foreign_keys=[winner_id])

    def __repr__(self):
        return f"<ArenaChallenge {self.id} - {self.challenger_id} vs {self.opponent_username}>"


# =============================================================================
# ARENA — PROVAS CUSTOMIZADAS (CONCURSOS)
# Card = gerador PESSOAL de provas a partir das bibliotecas do usuário + dossiê de
# pesquisa da banca. Ferramenta PRIVADA — sem compartilhar/competir (concurso é jogo
# de soma zero; o usuário não dá suas provas a concorrentes). Desenho: docs/ARENA_CUSTOM_EXAMS.md
# =============================================================================

class CustomExamCard(Base):
    """Gerador/template de prova customizada criado pelo usuário (ex.: um concurso).
    Contexto dinâmico: bibliotecas-fonte + dossiê de pesquisa + histórico de provas."""
    __tablename__ = 'custom_exam_cards'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    name = Column(String(120), nullable=False)
    description = Column(Text, nullable=True)
    language = Column(String(10), default='pt-BR', nullable=False)

    # Config de geração: {num_questions, time_limit_minutes, objective_ratio,
    # difficulty_distribution, question_type, ...}
    config = Column(JSON, nullable=False, default=dict)

    # Dossiê da pesquisa web sobre a prova/banca (cacheado; revisável pelo dono):
    # {confirmed, banca, format_notes, themes[], sources[], past_exam_examples[], researched_at}
    dossier = Column(JSON, nullable=True)

    status = Column(String(20), default='active', nullable=False)  # active / archived
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    user = relationship('User', back_populates='custom_exam_cards')
    sources = relationship('CustomCardSource', back_populates='card', cascade='all, delete-orphan')

    def __repr__(self):
        return f"<CustomExamCard {self.id} - {self.name} (user {self.user_id})>"


class CustomCardSource(Base):
    """Vincula um Card a uma biblioteca-fonte (1 linha por biblioteca). Upload direto
    no Card cria uma biblioteca de apoio e entra aqui — fontes ficam uniformes (= bibliotecas)."""
    __tablename__ = 'custom_card_sources'

    id = Column(Integer, primary_key=True)
    card_id = Column(Integer, ForeignKey('custom_exam_cards.id', ondelete='CASCADE'), nullable=False, index=True)
    library_id = Column(Integer, ForeignKey('academic_libraries.id', ondelete='SET NULL'), nullable=True)

    card = relationship('CustomExamCard', back_populates='sources')
    library = relationship('AcademicLibrary')

    __table_args__ = (
        UniqueConstraint('card_id', 'library_id', name='uq_card_source'),
    )

    def __repr__(self):
        return f"<CustomCardSource card={self.card_id} library={self.library_id}>"


# =============================================================================
# AMBULATÓRIO MODELS
# =============================================================================

class Patient(Base):
    """Patients registered by doctors for consultations and prescriptions"""
    __tablename__ = 'patients'

    id = Column(Integer, primary_key=True)
    doctor_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    # Field-level encryption (Fernet) — schema is BYTEA at the DB level after
    # migration 2026_05_28_field_enc. NULL allowed for legacy rows; app
    # validates required fields in upstream schemas.
    full_name = Column(EncryptedString, nullable=True)
    birth_date = Column(DateTime(timezone=True), nullable=True)
    gender = Column(String(20), nullable=True)  # male, female, other
    phone = Column(EncryptedString, nullable=True)
    email = Column(EncryptedString, nullable=True)
    country = Column(String(5), nullable=True)  # Patient nationality (br, co, ar, mx, etc.)
    document_id = Column(EncryptedString, nullable=True)  # National ID (CPF, CC, DNI, CURP, RUT, SSN, etc.)
    address = Column(EncryptedString, nullable=True)

    # Clinical history from external sources (UBS, other clinics)
    clinical_history = Column(EncryptedString, nullable=True)  # Raw imported history text
    clinical_history_parsed = Column(JSON, nullable=True)  # AI-structured: [{date, chief_complaint, notes, diagnosis, plan}]

    # Clinical alerts — JSON values, encrypted at-rest
    allergies = Column(EncryptedJSON, nullable=True)  # ["Penicilina", "Dipirona"]
    chronic_conditions = Column(EncryptedJSON, nullable=True)  # ["Hipertensão", "DM2"]
    current_medications = Column(EncryptedJSON, nullable=True)  # ["Losartana 50mg", "Metformina 850mg"]
    
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    doctor = relationship('User', back_populates='patients')
    consultations = relationship('Consultation', back_populates='patient')
    prescriptions = relationship('Prescription', back_populates='patient', cascade="all, delete-orphan")
    documents = relationship('MedicalDocument', back_populates='patient', cascade="all, delete-orphan")
    exam_orders = relationship('ExamOrder', back_populates='patient', cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Patient {self.id} - {self.full_name}>"


class Consultation(Base):
    __tablename__ = 'consultations'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=True)  # Optional for backward compatibility
    specialty = Column(String(100), nullable=False)
    is_first_consultation = Column(Boolean, default=True)
    # Field-level encryption — BYTEA at DB level after 2026_05_28_field_enc.
    raw_notes = Column(EncryptedString, nullable=True)
    improved_notes = Column(EncryptedString)
    summary = Column(EncryptedString)

    # New structured fields
    chief_complaint = Column(EncryptedString, nullable=True)  # Main complaint
    icd_codes = Column(JSON, nullable=True)  # List of ICD-10 codes e.g. ["I10", "E11.9"]
    vital_signs = Column(JSON, nullable=True)  # {"bp": "120/80", "hr": 72, "rr": 16, "spo2": 98, "temp": 36.5, "weight": 70}
    physical_exam = Column(EncryptedString, nullable=True)  # Structured physical exam findings
    ai_suggestions_accepted = Column(Integer, default=0)  # Count of AI suggestions accepted
    duration_minutes = Column(Integer, nullable=True)  # Consultation duration
    
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), onupdate=lambda: datetime.now(timezone.utc))

    user = relationship('User', back_populates='consultations')
    patient = relationship('Patient', back_populates='consultations')

    def __repr__(self):
        return f"<Consultation {self.id} - Specialty: {self.specialty} - User: {self.user_id}>"



class Prescription(Base):
    """Digital prescriptions created by doctors"""
    __tablename__ = 'prescriptions'

    id = Column(Integer, primary_key=True)
    doctor_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=False)
    consultation_id = Column(Integer, ForeignKey('consultations.id'), nullable=True)
    
    # Type: 'simple', 'controlled_c1', 'controlled_c2', 'controlled_b1', 'controlled_b2'
    prescription_type = Column(String(30), default='simple')
    
    # Items: [{medication, dosage, frequency, duration, quantity, instructions}]
    items = Column(JSON, nullable=False)
    
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    doctor = relationship('User', backref='prescriptions')
    patient = relationship('Patient', back_populates='prescriptions')
    consultation = relationship('Consultation', backref='prescriptions')

    def __repr__(self):
        return f"<Prescription {self.id} - Patient: {self.patient_id}>"


class MedicalDocument(Base):
    """Medical documents: attestados, declarations, reports"""
    __tablename__ = 'medical_documents'

    id = Column(Integer, primary_key=True)
    doctor_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=False)
    
    # Type: 'sick_leave', 'fitness', 'attendance', 'report', 'referral'
    document_type = Column(String(30), nullable=False)
    
    # Content structure depends on type (JSON for flexibility)
    # sick_leave: {cid, days, start_date, description}
    # fitness: {purpose, valid_until}
    # attendance: {date, time, duration}
    # report: {content, diagnosis}
    # referral: {specialty, reason, urgency}
    content = Column(JSON, nullable=False)
    
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    doctor = relationship('User', backref='medical_documents')
    patient = relationship('Patient', back_populates='documents')

    def __repr__(self):
        return f"<MedicalDocument {self.id} - Type: {self.document_type}>"


class ExamOrder(Base):
    """Laboratory and imaging exam orders"""
    __tablename__ = 'exam_orders'

    id = Column(Integer, primary_key=True)
    doctor_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=False)
    consultation_id = Column(Integer, ForeignKey('consultations.id'), nullable=True)
    
    # Exams: [{name, code, category}]
    exams = Column(JSON, nullable=False)
    
    clinical_indication = Column(Text, nullable=True)
    urgency = Column(String(20), default='routine')  # 'routine', 'urgent', 'emergency'
    
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    doctor = relationship('User', backref='exam_orders')
    patient = relationship('Patient', back_populates='exam_orders')
    consultation = relationship('Consultation', backref='exam_orders')

    def __repr__(self):
        return f"<ExamOrder {self.id} - Patient: {self.patient_id}>"


class PatientOrientation(Base):
    """Patient education materials - templates and AI-generated"""
    __tablename__ = 'patient_orientations'

    id = Column(Integer, primary_key=True)
    doctor_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=True)
    generation_type = Column(String(20), nullable=False, default='template')  # 'template' | 'ai_generated'
    template_key = Column(String(50), nullable=True)
    title = Column(String(200), nullable=False)
    content = Column(Text, nullable=False)  # HTML for PDF
    ai_prompt = Column(Text, nullable=True)  # original prompt (data flywheel)
    specialty = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    doctor = relationship('User', backref='patient_orientations')
    patient = relationship('Patient', backref='orientations')

    def __repr__(self):
        return f"<PatientOrientation {self.id} - {self.title[:30]}>"


class User(Base):
    __tablename__ = 'users'

    id = Column(Integer, primary_key=True)
    email = Column(String(120), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(100), nullable=False)
    username = Column(String(30), unique=True, nullable=True)  # @username for community/rankings
    specialty = Column(String(100), nullable=True)  # Medical specialty (optional, self-declared)
    treatment = Column(String(20), nullable=True)  # Salutation prefix (Dr./Dra.) — self-declared, optional
    is_admin = Column(Boolean, default=False)
    occupation = Column(String(50), nullable=False)
    university = Column(String(100))
    # Field-level encryption — BYTEA at the DB level after 2026_05_28_field_enc.
    # Application enforces presence at signup time.
    phone_number = Column(EncryptedString, nullable=True)
    phone_verified = Column(Boolean, default=False)  # True if verified via Firebase SMS
    period = Column(String(20))
    matricula = Column(String(50))
    identifier_type = Column(String(50))
    identifier_number = Column(String(50))
    referral_source = Column(String(255))
    subscription_plan = Column(String(50), default='interno', nullable=False)
    
    # Status: 'pending' (email não verificado), 'waitlist' (verificado, sem convite), 'active' (acesso total)
    status = Column(String(20), default='pending')
    # ACESSO às features de IA é política do Qython, SEPARADA da verificação Latreo.
    # `verification_status` é a verdade do Latreo (nunca forjada aqui); `access_granted`
    # é o Qython liberando o uso sem afirmar que o usuário é Latreo-verificado.
    # Acesso efetivo = is_admin OR verification_status=='verified' OR access_granted.
    access_granted = Column(Boolean, default=False, nullable=False, server_default='false')
    # True quando o usuário passou (ou pulou) o wizard de onboarding (avatar/username/plano).
    # Novos usuários começam False; usuários existentes recebem True na migração (backfill).
    onboarding_completed = Column(Boolean, default=False, nullable=False, server_default='false')

    storage_used_bytes = Column(BigInteger, default=0, nullable=False)
    dracmas = Column(Float, default=0.0)
    last_student_bonus_date = Column(DateTime(timezone=True), nullable=True)  # Data do último bônus mensal de estudante
    last_monthly_credit_date = Column(DateTime(timezone=True), nullable=True)  # Data do último crédito mensal do plano interno
    
    # KYC / Verification Fields
    country = Column(String(10), nullable=True)  # Country code (br, us, es, etc.)
    verification_status = Column(String(50), default='pending')  # pending, verified, rejected, manual_review
    verification_notes = Column(Text, nullable=True)  # AI explanation or admin notes
    # Latreo identity verification (doctors & medical students). Biometrics live at
    # Latreo, never here — these columns mirror the result. See docs/LATREO_INTEGRATION_PROPOSAL.md.
    verification_provider = Column(String(20), nullable=True)  # 'latreo' | 'internal'
    # doctor: bronze | prata | ouro (legacy basic/strong, pre-Latreo-v1.63 rename) ·
    # student (kind=student): verified | verified_strong
    verification_tier = Column(String(20), nullable=True)
    latreo_doctor_id = Column(Integer, nullable=True)  # Latreo's doctor user id (for webhook mapping)
    latreo_session_id = Column(String(40), nullable=True)  # last Latreo verification session id
    verified_at = Column(DateTime(timezone=True), nullable=True)
    last_verification_check_at = Column(DateTime(timezone=True), nullable=True)

    profile_picture = Column(String(255))
    doctor_logo = Column(String(255), nullable=True)  # Custom logo for medical PDFs
    theme_preference = Column(String(50), default='dark')
    language_preference = Column(String(10), default='pt-BR')
    marketing_consent = Column(Boolean, default=False)  # Consent for ecosystem marketing emails
    autosave_consultation_drafts = Column(Boolean, nullable=False, default=True)
    # DEPRECATED — kept for backwards compatibility while we migrate to user_consents.
    # New code should query UserConsent for ml_training_* scopes instead.
    training_data_opt_out = Column(Boolean, default=False, nullable=False)
    # LGPD: timestamp of the most recent ML training consent grant (any scope).
    # NULL means user has never opted in to ML training. Source of truth lives in user_consents.
    training_data_consent_at = Column(DateTime(timezone=True), nullable=True)
    training_data_consent_version = Column(String(20), nullable=True)
    # Soft delete — set when user exercises Art. 18 VI. Cascading deletion is
    # executed by data_export_service, this flag prevents login while async cleanup runs.
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    notification_preferences = Column(JSON, nullable=True)  # Push/email notification preferences per type
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    # MutableDict so in-place key updates persist — a plain JSON column doesn't
    # flag dirty on `d[k]=v` + reassign of the same ref, which caused lifecycle
    # emails (inactivity/deactivation/digest) to re-send every run.
    email_tracking = Column(MutableDict.as_mutable(JSON), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    consultations = relationship('Consultation', back_populates='user', cascade="all, delete-orphan")
    patients = relationship('Patient', back_populates='doctor', cascade="all, delete-orphan")
    transactions = relationship('Transaction', back_populates='user', cascade="all, delete-orphan")
    avatar_history = relationship('AvatarHistory', back_populates='user', cascade="all, delete-orphan")
    anamnesis_templates = relationship('UserAnamnesisTemplate', back_populates='user', cascade="all, delete-orphan")
    feedback = relationship('Feedback', back_populates='user', cascade="all, delete-orphan")
    chat_sessions = relationship('ChatSession', back_populates='user', cascade="all, delete-orphan")
    academic_libraries = relationship('AcademicLibrary', back_populates='user', cascade="all, delete-orphan")
    stats = relationship('UserStats', back_populates='user', uselist=False, cascade="all, delete-orphan")
    achievements = relationship('Achievement', back_populates='user', cascade="all, delete-orphan")
    quiz_attempts = relationship('QuizAttempt', back_populates='user', cascade="all, delete-orphan")
    academic_materials = relationship('AcademicMaterial', back_populates='user', cascade="all, delete-orphan")
    podcast_generation_jobs = relationship('PodcastGenerationJob', back_populates='user', cascade="all, delete-orphan")
    video_lesson_jobs = relationship('VideoLessonJob', back_populates='user', cascade="all, delete-orphan")
    simulado_generation_jobs = relationship('SimuladoGenerationJob', back_populates='user', cascade="all, delete-orphan")
    enrolled_exams = relationship("ArenaExam", secondary=user_exam_enrollment, back_populates="enrolled_users")
    season_rankings = relationship("SeasonRanking", back_populates="user", cascade="all, delete-orphan")
    xp_profile = relationship("UserXpProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    custom_exam_cards = relationship('CustomExamCard', back_populates='user', cascade="all, delete-orphan")
    consents = relationship('UserConsent', back_populates='user', cascade='all, delete-orphan',
                            foreign_keys='UserConsent.user_id')

    def __repr__(self):
        return f"<User {self.email} - {self.status}>"

class Invitation(Base):
    __tablename__ = 'invitations'

    id = Column(Integer, primary_key=True)
    token = Column(String(50), unique=True, nullable=False, index=True)
    is_used = Column(Boolean, default=False)
    
    # Quem usou o convite (pode ser nulo se ainda não usado)
    used_by_user_id = Column(Integer, ForeignKey('users.id'), nullable=True)
    
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relacionamento CORRIGIDO
    used_by = relationship('User', foreign_keys=[used_by_user_id])

    def __repr__(self):
        return f"<Invitation {self.token} - Used: {self.is_used}>"

class Transaction(Base):
    __tablename__ = 'transactions'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    amount = Column(Float, nullable=False)
    currency = Column(String(10), default='USD')
    provider = Column(String(20), default='stripe')
    provider_tx_id = Column(String(255), nullable=True)
    status = Column(String(20), default='completed')

    description = Column(String(255))
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    user = relationship('User', back_populates='transactions')

    def __repr__(self):
        return f"<Transaction {self.id} - {self.provider} - {self.amount} {self.currency}>"

class DracmaLedger(Base):
    """
    Ledger para tracking granular de dracmas com expiração.
    Cada entrada representa um "lote" de dracmas que foi adquirido.
    Consumo usa FIFO (First In, First Out) - dracmas mais antigos são consumidos primeiro.
    """
    __tablename__ = 'dracma_ledger'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)

    # Quantidade original e restante
    amount = Column(Float, nullable=False)  # Quantidade original
    remaining = Column(Float, nullable=False)  # Quantidade restante (decrementada conforme uso)

    # Fonte do dracma
    # 'purchase' - compra avulsa via Stripe/Binance
    # 'subscription' - crédito mensal de plano pago
    # 'internal_plan' - crédito mensal do plano interno (free)
    # 'student_bonus' - bônus mensal de estudante
    # 'registration' - bônus inicial no registro
    # 'promo' - promoções/campanhas
    # 'admin' - crédito manual por admin
    # 'migration' - migração de saldo existente
    source = Column(String(30), nullable=False, index=True)

    # Referência à transação original (se aplicável)
    transaction_id = Column(Integer, ForeignKey('transactions.id'), nullable=True)

    # Datas importantes
    acquired_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)

    # Status: 'active', 'consumed', 'expired', 'cancelled'
    status = Column(String(20), default='active', nullable=False, index=True)

    # Data de consumo total (quando remaining chegou a 0)
    consumed_at = Column(DateTime(timezone=True), nullable=True)

    # Descrição opcional
    description = Column(String(255), nullable=True)

    # Tracking de notificações de expiração enviadas
    expiration_notified_30d = Column(Boolean, default=False)  # Notificado 30 dias antes
    expiration_notified_7d = Column(Boolean, default=False)   # Notificado 7 dias antes
    expiration_notified_1d = Column(Boolean, default=False)   # Notificado 1 dia antes

    # Relacionamentos
    user = relationship('User', backref='dracma_ledger')
    transaction = relationship('Transaction', backref='dracma_ledger_entries')

    # Índices para queries frequentes
    __table_args__ = (
        Index('ix_dracma_ledger_user_active', 'user_id', 'status'),
        Index('ix_dracma_ledger_expiration', 'expires_at', 'status'),
    )

    def __repr__(self):
        return f"<DracmaLedger {self.id} - {self.remaining}/{self.amount} {self.source} - {self.status}>"


class AvatarHistory(Base):
    __tablename__ = 'avatar_history'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    filename = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    user = relationship('User', back_populates='avatar_history')

    def __repr__(self):
        return f"<AvatarHistory {self.id} - User: {self.user_id} - Filename: {self.filename}>"

class UserAnamnesisTemplate(Base):
    __tablename__ = 'user_anamnesis_templates'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    specialty = Column(String(100), nullable=False)
    consultation_type = Column(String(50), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user = relationship('User', back_populates='anamnesis_templates')

    __table_args__ = (UniqueConstraint('user_id', 'specialty', 'consultation_type', name='_user_specialty_consultation_uc'),)

    def __repr__(self):
        return f"<UserAnamnesisTemplate {self.id} - User: {self.user_id} - Specialty: {self.specialty} - Type: {self.consultation_type}>"

class Feedback(Base):
    __tablename__ = 'feedback'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    user_occupation = Column(String(50), nullable=True)
    user_prompt = Column(Text, nullable=True)
    feedback_type = Column(String(10), nullable=False)
    content_type = Column(String(50), nullable=False)
    content_id = Column(String(255), nullable=True)
    original_content = Column(Text, nullable=False)
    conversation_context = Column(JSON, nullable=True)
    feedback_text = Column(Text, nullable=True)
    contact_permission = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    user = relationship('User', back_populates='feedback')

    def __repr__(self):
        return f"<Feedback {self.id} - User: {self.user_id} - Type: {self.feedback_type}>"

class ChatSession(Base):
    __tablename__ = 'chat_sessions'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    title = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user = relationship('User', back_populates='chat_sessions')
    messages = relationship('ChatMessage', back_populates='session', cascade="all, delete-orphan")

    def __repr__(self):
        return f"<ChatSession {self.id} - '{self.title}'>"

class ChatMessage(Base):
    __tablename__ = 'chat_messages'
    id = Column(Integer, primary_key=True)
    session_id = Column(Integer, ForeignKey('chat_sessions.id'), nullable=False)
    sender = Column(String(50), nullable=False)
    content = Column(Text, nullable=False)
    image_url = Column(String(500), nullable=True)
    file_name = Column(Text, nullable=True)  # JSON array of attached filenames
    sources = Column(JSON, nullable=True)  # Grounding sources from Google Search
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    session = relationship('ChatSession', back_populates='messages')

    def __repr__(self):
        return f"<ChatMessage {self.id} from {self.sender}>"

class AcademicLibrary(Base):
    __tablename__ = 'academic_libraries'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    icon = Column(String(50), nullable=True, default='book')
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    user = relationship('User', back_populates='academic_libraries')
    documents = relationship('AcademicDocument', back_populates='library', cascade="all, delete-orphan")

    def __repr__(self):
        return f"<AcademicLibrary {self.id} - User: {self.user_id} - Name: {self.name}>"

class AcademicDocument(Base):
    __tablename__ = 'academic_documents'

    id = Column(Integer, primary_key=True)
    library_id = Column(Integer, ForeignKey('academic_libraries.id'), nullable=False)
    original_filename = Column(String(255), nullable=False)
    # Drive-first: NULL = sem original no servidor (Drive-only ou já descartado após
    # processamento). Legado/transiente aponta p/ PERMANENT_UPLOAD_FOLDER ou o temp de staging.
    storage_path = Column(String(500), nullable=True)
    thumbnail_url = Column(String(500), nullable=True)
    status = Column(String(50), default='pending', nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    file_size_bytes = Column(BigInteger, nullable=True)

    # Conectores (Biblioteca Drive-first, 2026-07). Ver migration 2026_07_11_docs_drive_fields.
    drive_file_id = Column(String(128), nullable=True)      # id do original na nuvem do usuário
    storage_provider = Column(String(20), nullable=True)    # NULL = legado server-side | 'gdrive'
    drive_origin = Column(String(20), nullable=True)        # 'uploaded' (write-through) | 'imported' (Picker)
    error_code = Column(String(40), nullable=True)          # falha acionável (drive_quota_full, cloud_reauth_required, ...)

    library = relationship('AcademicLibrary', back_populates='documents')
    images = relationship('DocumentImage', back_populates='document', cascade='all, delete-orphan')

    def __repr__(self):
        return f"<AcademicDocument {self.id} - Library: {self.library_id} - Status: {self.status}>"


class DocumentImage(Base):
    """Images extracted from PDF documents for vision analysis."""
    __tablename__ = 'document_images'

    id = Column(Integer, primary_key=True)
    document_id = Column(Integer, ForeignKey('academic_documents.id', ondelete='CASCADE'), nullable=False)
    library_id = Column(Integer, ForeignKey('academic_libraries.id', ondelete='CASCADE'), nullable=False)

    # File info
    image_filename = Column(String(255), nullable=False)
    page_number = Column(Integer, nullable=False)
    image_index = Column(Integer, nullable=False)  # Index within page
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    file_size_bytes = Column(BigInteger, nullable=True)

    # Vision processing
    vision_status = Column(String(20), default='pending', nullable=False)  # pending/processing/completed/failed
    vision_description = Column(Text, nullable=True)
    vision_model = Column(String(100), nullable=True)
    vision_error = Column(Text, nullable=True)
    retry_count = Column(Integer, default=0, nullable=False)
    vision_completed_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    document = relationship('AcademicDocument', back_populates='images')

    __table_args__ = (
        Index('ix_document_images_document_id', 'document_id'),
        Index('ix_document_images_library_id', 'library_id'),
        Index('ix_document_images_vision_status', 'vision_status'),
    )

    def __repr__(self):
        return f"<DocumentImage {self.id} doc={self.document_id} page={self.page_number} status={self.vision_status}>"


class UserStats(Base):
    __tablename__ = 'user_stats'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, unique=True)
    total_score = Column(Integer, default=0)
    quizzes_completed = Column(Integer, default=0)
    correct_answers = Column(Integer, default=0)
    incorrect_answers = Column(Integer, default=0)

    user = relationship('User', back_populates='stats')

class Achievement(Base):
    __tablename__ = 'achievements'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    badge_code = Column(String(100), nullable=False)
    achieved_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    user = relationship('User', back_populates='achievements')
    __table_args__ = (UniqueConstraint('user_id', 'badge_code', name='_user_badge_uc'),)

class QuizAttempt(Base):
    __tablename__ = 'quiz_attempts'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    quiz_specialty = Column(String(100), nullable=False)
    score = Column(Integer, nullable=False)
    mode = Column(String(20), nullable=False)
    completed_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # XP system fields
    xp_earned = Column(Integer, default=0, nullable=False)
    correct_count = Column(Integer, default=0, nullable=False)
    incorrect_count = Column(Integer, default=0, nullable=False)
    unanswered_count = Column(Integer, default=0, nullable=False)
    total_questions = Column(Integer, default=0, nullable=False)
    time_elapsed_seconds = Column(Integer, nullable=True)
    answers_detail = Column(JSON, nullable=True)  # Full review data per question

    user = relationship('User', back_populates='quiz_attempts')

class PodcastGenerationJob(Base):
    __tablename__ = 'podcast_generation_jobs'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    status = Column(String(50), default='pending', nullable=False)
    result_path = Column(String(500), nullable=True)
    script_path = Column(String(500), nullable=True)  # Path to the podcast script text file
    error_message = Column(Text, nullable=True)
    # Progress tracking fields
    progress_percent = Column(Integer, default=0)
    current_step = Column(String(100), nullable=True)
    total_chunks = Column(Integer, default=0)
    completed_chunks = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    expires_at = Column(DateTime(timezone=True), nullable=True, index=True)

    training_data_id = Column(Integer, nullable=True)  # id do TrainingData (match de feedback à prova de balas)

    user = relationship('User', back_populates='podcast_generation_jobs')

class VideoLessonJob(Base):
    __tablename__ = 'video_lesson_jobs'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    status = Column(String(50), default='pending', nullable=False)
    result_path = Column(String(500), nullable=True)
    srt_path = Column(String(500), nullable=True)
    error_message = Column(Text, nullable=True)
    # Progress tracking fields
    progress_percent = Column(Integer, default=0)
    current_step = Column(String(100), nullable=True)
    total_steps = Column(Integer, default=0)
    completed_steps = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    expires_at = Column(DateTime(timezone=True), nullable=True, index=True)

    training_data_id = Column(Integer, nullable=True)  # id do TrainingData (match de feedback à prova de balas)

    user = relationship('User', back_populates='video_lesson_jobs')

class SimuladoGenerationJob(Base):
    __tablename__ = 'simulado_generation_jobs'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    status = Column(String(50), default='pending', nullable=False)
    result_content = Column(JSON, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    training_data_id = Column(Integer, nullable=True)  # id do TrainingData (match de feedback à prova de balas)

    user = relationship('User', back_populates='simulado_generation_jobs')

class AcademicMaterial(Base):
    __tablename__ = 'academic_materials'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    # Biblioteca de origem (quando gerado a partir de uma biblioteca). Usado p/ consultar
    # provas já geradas DAQUELA biblioteca e evitar repetir questões. Nullable: materiais
    # vindos de upload/filepath não têm biblioteca.
    library_id = Column(Integer, ForeignKey('academic_libraries.id', ondelete='SET NULL'), nullable=True, index=True)
    # Card de prova customizada que gerou este material (pilar "Meus Concursos" da
    # Arena). Permite a anti-repetição POR CARD (não só por biblioteca). Nullable:
    # materiais comuns não vêm de um card. Ver docs/ARENA_CUSTOM_EXAMS.md
    card_id = Column(Integer, ForeignKey('custom_exam_cards.id', ondelete='SET NULL'), nullable=True, index=True)
    material_type = Column(String(100), nullable=False)
    content = Column(JSON, nullable=False)
    status = Column(String(50), default='completed', nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    expires_at = Column(DateTime(timezone=True), nullable=True, index=True)

    training_data_id = Column(Integer, nullable=True)  # id do TrainingData (match de feedback à prova de balas)

    user = relationship('User', back_populates='academic_materials')

    def __repr__(self):
        return f"<AcademicMaterial {self.id} - Type: {self.material_type} - User: {self.user_id}>"


# === DATA FLYWHEEL: Dados para Treinamento do Qython-1 ===
class TrainingData(Base):
    __tablename__ = 'training_data'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=True)  # Pode ser nulo se deletarmos o user

    # Fonte: 'consultation', 'chat', 'podcast_script', 'exam_question', 'summary', 'image_diagnosis'
    source_type = Column(String(50), nullable=False, index=True)

    # O contexto de entrada (ex: Anotações brutas, Pergunta do Chat)
    input_data = Column(Text, nullable=False)

    # O resultado da IA (ex: Anamnese perfeita, Resposta do Chat)
    output_data = Column(Text, nullable=False)

    # Metadados para filtragem (ex: {"specialty": "Cardiologia", "has_image": true})
    metadata_info = Column(JSON, nullable=True)

    # Referências bibliográficas citadas (ex: [{"url": "...", "pmid": "12345", "title": "..."}])
    references = Column(JSON, nullable=True)

    # Qualidade (0 = neutro, 1 = like/salvo, -1 = dislike, 2 = gold, 3 = platinum)
    quality_score = Column(Integer, default=0)

    # Hash MD5 do conteúdo para evitar duplicatas
    content_hash = Column(String(32), nullable=True, index=True, unique=True)

    # Flags de processamento
    is_anonymized = Column(Boolean, default=False)
    ready_for_training = Column(Boolean, default=False)

    # === NOVOS CAMPOS (2026 Best Practices) ===

    # Curriculum Learning: dificuldade estimada do exemplo (0.0=fácil, 1.0=difícil)
    # Útil para treinamento progressivo (exemplos fáceis primeiro)
    difficulty_score = Column(Float, nullable=True)

    # Métricas de engajamento do usuário
    # regeneration_count: quantas vezes o usuário pediu nova resposta
    regeneration_count = Column(Integer, default=0)
    # time_to_first_edit_ms: tempo até o usuário começar a editar (null = não editou)
    time_to_first_edit_ms = Column(Integer, nullable=True)
    # total_edit_time_ms: tempo total de edição antes de salvar
    total_edit_time_ms = Column(Integer, nullable=True)
    # accepted_without_edit: True se usuário aceitou sem modificar
    accepted_without_edit = Column(Boolean, nullable=True)

    # === ML PIPELINE COLUMNS (2026-02 Enhancements) ===

    # How the data was created: 'human', 'ai_generated', 'hybrid' (user edited AI output)
    creation_method = Column(String(20), nullable=True, index=True)

    # Data provenance: 0=human, 1=first AI generation, N+1=model trained on gen N
    generation_number = Column(Integer, default=0)

    # Bloom's taxonomy level for curriculum learning
    bloom_level = Column(String(20), nullable=True, index=True)

    # Held-out evaluation set (NEVER used for training, only benchmarking)
    is_evaluation_holdout = Column(Boolean, default=False, index=True)

    # PII detection flag (set by pii_detector, reviewed during export)
    pii_detected = Column(Boolean, default=False, index=True)

    # LGPD: ties this entry to the consent that authorized its capture for training.
    # NULL is allowed for legacy entries — pre-export validator handles those separately.
    consent_id = Column(Integer, ForeignKey('user_consents.id', ondelete='SET NULL'),
                        nullable=True, index=True)

    # 'pseudo' = identifiers tokenized via QYTHON_TOKEN_KEK (reversible inside Qython)
    # 'anon'   = irreversibly anonymized; out of LGPD scope per Art. 12
    # NULL     = legacy entry, needs reprocessing
    anonymization_level = Column(String(10), nullable=True, index=True)

    # Marks entries removed from training pool due to user revocation. Kept for audit
    # but never exported. Cron sets this when consent.revoked event fires.
    excluded_due_to_revocation = Column(Boolean, default=False, nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    user = relationship('User', backref='training_data')
    consent = relationship('UserConsent', foreign_keys=[consent_id])

    def __repr__(self):
        return f"<TrainingData {self.id} - {self.source_type}>"


# === PREFERENCE DATA: Dados para DPO/RLHF do Qython-1 ===
class PreferenceData(Base):
    """
    Armazena pares de preferência (chosen/rejected) para Direct Preference Optimization (DPO).
    Este é o formato padrão da indústria em 2026 para fine-tuning de LLMs.

    Referências:
    - https://huggingface.co/blog/pref-tuning
    - https://pytorch.org/torchtune/0.3/basics/preference_datasets.html
    """
    __tablename__ = 'preference_data'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=True)

    # Prompt/contexto que gerou as respostas
    prompt = Column(Text, nullable=False)

    # Resposta preferida (escolhida pelo usuário ou LLM-as-judge)
    chosen = Column(Text, nullable=False)

    # Resposta rejeitada (a que o usuário não gostou ou regenerou)
    rejected = Column(Text, nullable=False)

    # Fonte: 'chat', 'consultation_draft', 'consultation_summary', 'icd10', 'library_rag', etc.
    source_type = Column(String(50), nullable=False, index=True)

    # Metadados adicionais (specialty, model_used, etc.)
    metadata_info = Column(JSON, nullable=True)

    # Origem da preferência: 'human' (usuário), 'llm_judge' (LLM-as-judge), 'implicit' (regeneração)
    preference_source = Column(String(20), default='human', nullable=False)

    # Confiança do julgamento (0.0-1.0, útil para LLM-as-judge)
    confidence_score = Column(Float, default=1.0)

    # Idioma do conteúdo
    language = Column(String(10), default='pt-BR')

    # Hash para evitar duplicatas
    content_hash = Column(String(32), nullable=True, index=True, unique=True)

    # Flag de processamento
    ready_for_export = Column(Boolean, default=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    user = relationship('User', backref='preference_data')

    def __repr__(self):
        return f"<PreferenceData {self.id} - {self.source_type} - {self.preference_source}>"

    def to_dpo_format(self):
        """Converte para o formato padrão DPO usado por frameworks como TRL/TorchTune."""
        return {
            "prompt": self.prompt,
            "chosen": self.chosen,
            "rejected": self.rejected,
            "source_type": self.source_type,
            "language": self.language,
            "metadata": self.metadata_info
        }


# === QUALITY DECAY DETECTION: Snapshots for model collapse monitoring ===
class QualitySnapshot(Base):
    """
    Periodic snapshot of training data quality metrics.
    Used to detect quality decay / model collapse over time.
    Computed weekly by scheduler, viewable via admin endpoints.
    """
    __tablename__ = 'quality_snapshots'

    id = Column(Integer, primary_key=True)
    snapshot_data = Column(JSON, nullable=False)  # Full metrics snapshot
    alerts = Column(JSON, nullable=True)  # List of triggered alerts
    health_status = Column(String(20), default='healthy')  # healthy/warning/critical
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    def __repr__(self):
        return f"<QualitySnapshot {self.id} - {self.health_status}>"


# === ITERATIVE REFINEMENT TRACKING: Chain of refinements for training ===
class RefinementChain(Base):
    """
    Tracks iterative refinement chains: original → refined → re-refined.
    Each entry links a refined TrainingData to its predecessor, capturing
    the improvement delta so models can learn to self-improve.
    """
    __tablename__ = 'refinement_chains'

    id = Column(Integer, primary_key=True)

    # The original (source) training data entry
    original_id = Column(Integer, ForeignKey('training_data.id'), nullable=False, index=True)

    # The refined (improved) training data entry
    refined_id = Column(Integer, ForeignKey('training_data.id'), nullable=False, index=True)

    # Step in the chain (1 = first refinement, 2 = second, etc.)
    step = Column(Integer, default=1, nullable=False)

    # What triggered the refinement
    refinement_type = Column(String(30), nullable=False)
    # Values: 'self_critique' (auto-refined by self-critique service),
    #         'user_edit' (physician edited AI output),
    #         'regeneration' (user requested new response),
    #         'rlaif_judge' (AI judge flagged + re-generated)

    # Refinement metadata: critique scores, diff summary, etc.
    refinement_metadata = Column(JSON, nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    original = relationship('TrainingData', foreign_keys=[original_id], backref='refinements_from')
    refined = relationship('TrainingData', foreign_keys=[refined_id], backref='refinements_to')

    __table_args__ = (
        UniqueConstraint('original_id', 'refined_id', name='uq_refinement_pair'),
    )

    def __repr__(self):
        return f"<RefinementChain {self.original_id} → {self.refined_id} step={self.step}>"


# =============================================================================
# PAYMENT WAITLIST (Coming Soon)
# =============================================================================

class PaymentWaitlist(Base):
    """Email waitlist for users interested in premium plans before payment integration is ready"""
    __tablename__ = 'payment_waitlist'

    id = Column(Integer, primary_key=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    notified = Column(Boolean, default=False)  # True when notified that payments are live

    def __repr__(self):
        return f"<PaymentWaitlist {self.email}>"


# =============================================================================
# PROFILE UPDATE REQUESTS
# =============================================================================

class ProfileUpdateRequest(Base):
    """
    Requests for sensitive profile updates that require verification.
    Used for: university changes, period updates, student→doctor transitions.
    """
    __tablename__ = 'profile_update_requests'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)

    # Request type: 'period_change', 'university_change', 'occupation_upgrade'
    request_type = Column(String(50), nullable=False, index=True)

    # Current values (JSON for flexibility)
    current_value = Column(JSON, nullable=False)

    # Requested new values (JSON for flexibility)
    requested_value = Column(JSON, nullable=False)

    # Supporting documents (list of file paths)
    documents = Column(JSON, nullable=True)

    # Status: 'pending', 'approved', 'rejected'
    status = Column(String(20), default='pending', index=True)

    # Admin notes (reason for rejection, etc.)
    admin_notes = Column(Text, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    reviewed_by = Column(Integer, ForeignKey('users.id'), nullable=True)

    # Relationships
    user = relationship('User', foreign_keys=[user_id], backref='profile_update_requests')
    reviewer = relationship('User', foreign_keys=[reviewed_by])

    def __repr__(self):
        return f"<ProfileUpdateRequest {self.id} - {self.request_type} - {self.status}>"


# =============================================================================
# SYSTEM SETTINGS & ADMIN CONTROLS
# =============================================================================

class SystemSettings(Base):
    """Key-value store for system configuration (payment gateways, maintenance mode, etc.)"""
    __tablename__ = 'system_settings'

    key = Column(String(100), primary_key=True)
    value = Column(Text, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    updated_by = Column(Integer, ForeignKey('users.id'), nullable=True)

    updater = relationship('User', foreign_keys=[updated_by])

    def __repr__(self):
        return f"<SystemSettings {self.key}={self.value}>"


class SettingsAuditLog(Base):
    """Audit log for all settings changes - who changed what and when"""
    __tablename__ = 'settings_audit_log'

    id = Column(Integer, primary_key=True)
    setting_key = Column(String(100), nullable=False, index=True)
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=False)
    changed_by = Column(Integer, ForeignKey('users.id'), nullable=True)  # Null for auto-maintenance changes
    changed_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    ip_address = Column(String(45), nullable=True)  # IPv6 support
    user_agent = Column(String(500), nullable=True)
    reason = Column(Text, nullable=True)  # Optional reason for the change

    user = relationship('User', foreign_keys=[changed_by])

    def __repr__(self):
        return f"<SettingsAuditLog {self.setting_key}: {self.old_value} -> {self.new_value}>"


class RateLimitEntry(Base):
    """Rate limiting entries for tracking API requests per user/IP"""
    __tablename__ = 'rate_limit_entries'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=True)  # Null for anonymous users
    ip_address = Column(String(45), nullable=False)  # IPv6 support
    endpoint = Column(String(200), nullable=False)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)

    user = relationship('User', foreign_keys=[user_id])

    # Composite indexes for fast queries
    __table_args__ = (
        Index('ix_rate_limit_user_time', 'user_id', 'timestamp'),
        Index('ix_rate_limit_ip_time', 'ip_address', 'timestamp'),
    )

    def __repr__(self):
        return f"<RateLimitEntry {self.ip_address} - {self.endpoint}>"


class ServerMetrics(Base):
    """Server performance metrics for monitoring and auto-maintenance triggers"""
    __tablename__ = 'server_metrics'

    id = Column(Integer, primary_key=True)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
    cpu_percent = Column(Float, nullable=True)
    memory_percent = Column(Float, nullable=True)
    disk_percent = Column(Float, nullable=True)
    active_connections = Column(Integer, nullable=True)
    requests_per_minute = Column(Integer, nullable=True)

    def __repr__(self):
        return f"<ServerMetrics CPU:{self.cpu_percent}% RAM:{self.memory_percent}%>"


# =============================================================================
# PHARMACY MODULE MODELS
# =============================================================================

class Medication(Base):
    """Medication catalog with Farmácia Popular support"""
    __tablename__ = 'medications'

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)  # Commercial name
    active_principle = Column(String(255), nullable=False, index=True)
    presentation = Column(String(255), nullable=True)  # e.g. "50mg, 30 comprimidos"
    atc_code = Column(String(20), nullable=True)  # WHO ATC classification
    therapeutic_class = Column(String(150), nullable=True)
    requires_prescription = Column(Boolean, default=True)
    controlled_type = Column(String(10), nullable=True)  # null/c1/c2/b1/b2
    item_type = Column(String(20), default='medication', nullable=False, index=True)  # 'medication' | 'supply'
    country = Column(String(5), default='br', nullable=False, index=True)
    farmacia_popular = Column(Boolean, default=False, index=True)
    farmacia_popular_copay = Column(Float, nullable=True)  # null=free, 0=free, >0=copay amount
    # Clinical reference fields (Whitebook-style)
    common_brands = Column(Text, nullable=True)  # Comma-separated brand names
    administration_route = Column(String(100), nullable=True)  # oral, inalatório, injetável, etc.
    usual_posology = Column(Text, nullable=True)  # Standard adult dosing
    max_daily_dose = Column(String(255), nullable=True)  # Safety ceiling
    common_indications = Column(Text, nullable=True)  # Main clinical uses
    pregnancy_category = Column(String(5), nullable=True)  # A, B, C, D, X
    renal_adjustment = Column(Boolean, default=False)  # Needs renal dose adjustment
    hepatic_adjustment = Column(Boolean, default=False)  # Needs hepatic dose adjustment
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), onupdate=lambda: datetime.now(timezone.utc))

    country_links = relationship("MedicationCountry", back_populates="medication", cascade="all, delete-orphan")
    brands = relationship("MedicationBrand", back_populates="medication", cascade="all, delete-orphan")
    translations = relationship("MedicationTranslation", back_populates="medication", cascade="all, delete-orphan")

    __table_args__ = (
        Index('ix_medication_name_principle', 'name', 'active_principle'),
    )

    def __repr__(self):
        return f"<Medication {self.id} - {self.name}>"


class MedicationTranslation(Base):
    """Override translations for medication names/active principles per locale."""
    __tablename__ = 'medication_translations'

    id = Column(Integer, primary_key=True)
    medication_id = Column(Integer, ForeignKey('medications.id', ondelete='CASCADE'), nullable=False)
    locale = Column(String(5), nullable=False)  # 'en', 'es'
    name = Column(String(255), nullable=True)  # Full name override
    active_principle = Column(String(255), nullable=True)  # Active principle override

    __table_args__ = (
        UniqueConstraint('medication_id', 'locale', name='uq_medication_translation_locale'),
        Index('ix_med_translation_lookup', 'medication_id', 'locale'),
    )

    medication = relationship("Medication", back_populates="translations")

    def __repr__(self):
        return f"<MedicationTranslation med={self.medication_id} locale={self.locale}>"


class MedicationCountry(Base):
    """Junction table: one medication available in many countries"""
    __tablename__ = 'medication_countries'

    id = Column(Integer, primary_key=True)
    medication_id = Column(Integer, ForeignKey('medications.id', ondelete='CASCADE'), nullable=False)
    country_code = Column(String(5), nullable=False, index=True)

    __table_args__ = (
        UniqueConstraint('medication_id', 'country_code', name='uq_medication_country'),
    )

    medication = relationship("Medication", back_populates="country_links")

    def __repr__(self):
        return f"<MedicationCountry med={self.medication_id} country={self.country_code}>"


class MedicationBrand(Base):
    """Country-specific brand names for medications"""
    __tablename__ = 'medication_brands'

    id = Column(Integer, primary_key=True)
    medication_id = Column(Integer, ForeignKey('medications.id', ondelete='CASCADE'), nullable=False)
    country_code = Column(String(5), nullable=False)
    brand_names = Column(Text, nullable=False)  # Comma-separated brand names

    __table_args__ = (
        UniqueConstraint('medication_id', 'country_code', name='uq_medication_brand_country'),
        Index('ix_medication_brands_lookup', 'medication_id', 'country_code'),
    )

    medication = relationship("Medication", back_populates="brands")

    def __repr__(self):
        return f"<MedicationBrand med={self.medication_id} country={self.country_code}>"


class DrugInteraction(Base):
    """Drug interaction pairs with severity and clinical management"""
    __tablename__ = 'drug_interactions'

    id = Column(Integer, primary_key=True)
    active_principle_a = Column(String(255), nullable=False, index=True)
    active_principle_b = Column(String(255), nullable=False, index=True)
    severity = Column(String(20), nullable=False)  # mild/moderate/severe/contraindicated
    description = Column(Text, nullable=False)  # What happens
    mechanism = Column(Text, nullable=True)  # Why it happens
    clinical_management = Column(Text, nullable=True)  # What to do
    source = Column(String(100), nullable=True)  # "Micromedex", "DrugBank"
    evidence_level = Column(String(30), nullable=True)  # established/probable/theoretical
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint('active_principle_a', 'active_principle_b', name='uq_interaction_pair'),
    )

    def __repr__(self):
        return f"<DrugInteraction {self.active_principle_a} + {self.active_principle_b} ({self.severity})>"


class GovernmentProgram(Base):
    """Government medication programs (e.g. Farmácia Popular, REMEDIAR)"""
    __tablename__ = 'government_programs'

    id = Column(Integer, primary_key=True)
    code = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    country = Column(String(5), nullable=False, index=True)
    description = Column(Text, nullable=True)
    legal_reference = Column(String(500), nullable=True)
    website_url = Column(String(500), nullable=True)
    is_active = Column(Boolean, default=True)
    all_items_free = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), onupdate=lambda: datetime.now(timezone.utc))

    medications = relationship("MedicationGovernmentProgram", back_populates="program", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<GovernmentProgram {self.code} ({self.country})>"


class MedicationGovernmentProgram(Base):
    """Junction table linking medications to government programs"""
    __tablename__ = 'medication_government_programs'

    id = Column(Integer, primary_key=True)
    medication_id = Column(Integer, ForeignKey('medications.id', ondelete='CASCADE'), nullable=False)
    program_id = Column(Integer, ForeignKey('government_programs.id', ondelete='CASCADE'), nullable=False)
    copay = Column(Float, default=0)
    max_quantity_per_month = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)

    __table_args__ = (
        UniqueConstraint('medication_id', 'program_id', name='uq_medication_program'),
    )

    medication = relationship("Medication")
    program = relationship("GovernmentProgram", back_populates="medications")

    def __repr__(self):
        return f"<MedicationGovernmentProgram med={self.medication_id} prog={self.program_id}>"


class PharmacyChain(Base):
    """Pharmacy chains/networks (e.g. RD Saúde, DPSP)"""
    __tablename__ = 'pharmacy_chains'

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)  # e.g. "RD Saúde"
    brand_names = Column(JSON, nullable=True)  # ["Raia", "Drogasil"]
    cnpj_matriz = Column(String(20), unique=True, nullable=True)
    logo_url = Column(String(500), nullable=True)
    website = Column(String(500), nullable=True)
    description = Column(Text, nullable=True)
    contact_name = Column(String(150), nullable=True)
    contact_email = Column(String(120), nullable=True)
    contact_phone = Column(String(20), nullable=True)
    subscription_tier = Column(String(20), default='individual')  # individual/regional/enterprise
    subscription_active = Column(Boolean, default=False)
    stripe_customer_id = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True, index=True)
    is_verified = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    pharmacies = relationship('Pharmacy', back_populates='chain', cascade="all, delete-orphan")

    def __repr__(self):
        return f"<PharmacyChain {self.id} - {self.name}>"


class Pharmacy(Base):
    """Individual pharmacy unit"""
    __tablename__ = 'pharmacies'

    id = Column(Integer, primary_key=True)
    chain_id = Column(Integer, ForeignKey('pharmacy_chains.id'), nullable=True)  # null = independent
    name = Column(String(255), nullable=False)
    brand_name = Column(String(255), nullable=True)  # e.g. "Drogasil" for RD Saúde unit
    cnpj = Column(String(20), unique=True, nullable=True)
    phone = Column(String(20), nullable=True)
    email = Column(String(120), nullable=True)
    address = Column(String(500), nullable=True)
    city = Column(String(100), nullable=True, index=True)
    state = Column(String(2), nullable=True, index=True)  # UF
    zip_code = Column(String(10), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    is_active = Column(Boolean, default=True, index=True)
    is_verified = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index('ix_pharmacy_geo', 'latitude', 'longitude'),
        Index('ix_pharmacy_city_state', 'city', 'state'),
    )

    # Relationships
    chain = relationship('PharmacyChain', back_populates='pharmacies')
    medications = relationship('PharmacyMedication', back_populates='pharmacy', cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Pharmacy {self.id} - {self.name}>"


class PharmacyMedication(Base):
    """Pharmacy inventory - which medications a pharmacy has and at what price"""
    __tablename__ = 'pharmacy_medications'

    id = Column(Integer, primary_key=True)
    pharmacy_id = Column(Integer, ForeignKey('pharmacies.id', ondelete='CASCADE'), nullable=False)
    medication_id = Column(Integer, ForeignKey('medications.id', ondelete='CASCADE'), nullable=False)
    price = Column(Float, nullable=True)  # R$
    farmacia_popular_price = Column(Float, nullable=True)  # R$, 0=free
    in_stock = Column(Boolean, default=True)
    last_stock_update = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint('pharmacy_id', 'medication_id', name='uq_pharmacy_medication'),
    )

    # Relationships
    pharmacy = relationship('Pharmacy', back_populates='medications')
    medication = relationship('Medication')

    def __repr__(self):
        return f"<PharmacyMedication pharmacy={self.pharmacy_id} med={self.medication_id}>"


class PrescriptionShare(Base):
    """Shareable prescription links via QR code"""
    __tablename__ = 'prescription_shares'

    id = Column(Integer, primary_key=True)
    prescription_id = Column(Integer, ForeignKey('prescriptions.id', ondelete='CASCADE'), nullable=False)
    share_token = Column(String(64), unique=True, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    expires_at = Column(DateTime(timezone=True), nullable=False)  # 30 days default
    view_count = Column(Integer, default=0)
    last_viewed_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(20), default='active')  # active/expired/revoked

    # Relationships
    prescription = relationship('Prescription', backref='shares')

    def __repr__(self):
        return f"<PrescriptionShare {self.share_token[:8]}... status={self.status}>"


class PharmacyPrescription(Base):
    """Direct prescription sends to pharmacies"""
    __tablename__ = 'pharmacy_prescriptions'

    id = Column(Integer, primary_key=True)
    prescription_id = Column(Integer, ForeignKey('prescriptions.id', ondelete='CASCADE'), nullable=False)
    pharmacy_id = Column(Integer, ForeignKey('pharmacies.id', ondelete='CASCADE'), nullable=False)
    doctor_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    status = Column(String(20), default='sent')  # sent/viewed/fulfilled/cancelled
    sent_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    viewed_at = Column(DateTime(timezone=True), nullable=True)
    fulfilled_at = Column(DateTime(timezone=True), nullable=True)
    pharmacy_notes = Column(Text, nullable=True)

    __table_args__ = (
        UniqueConstraint('prescription_id', 'pharmacy_id', name='uq_prescription_pharmacy'),
    )

    # Relationships
    prescription = relationship('Prescription', backref='pharmacy_sends')
    pharmacy = relationship('Pharmacy')
    doctor = relationship('User')

    def __repr__(self):
        return f"<PharmacyPrescription rx={self.prescription_id} pharmacy={self.pharmacy_id} status={self.status}>"


class PharmacyWaitlist(Base):
    """Waitlist for pharmacies interested in joining the platform"""
    __tablename__ = 'pharmacy_waitlist'

    id = Column(Integer, primary_key=True)
    pharmacy_name = Column(String(255), nullable=False)
    cnpj = Column(String(20), nullable=True)
    contact_name = Column(String(150), nullable=False)
    email = Column(String(120), nullable=False, index=True)
    phone = Column(String(20), nullable=True)
    city = Column(String(100), nullable=True)
    state = Column(String(2), nullable=True)
    is_chain = Column(Boolean, default=False)
    chain_size = Column(Integer, nullable=True)  # Number of units
    status = Column(String(20), default='pending')  # pending/contacted/onboarded/rejected
    admin_notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    def __repr__(self):
        return f"<PharmacyWaitlist {self.pharmacy_name} ({self.status})>"


class PushToken(Base):
    """FCM/APNs push notification tokens for mobile devices"""
    __tablename__ = 'push_tokens'
    __table_args__ = (
        UniqueConstraint('user_id', 'token', name='uq_push_tokens_user_token'),
    )

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    token = Column(String(500), nullable=False)
    platform = Column(String(20), nullable=False)  # android, ios, web
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    last_used_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    user = relationship("User", backref="push_tokens")

    def __repr__(self):
        return f"<PushToken user={self.user_id} platform={self.platform}>"


class Notification(Base):
    """Persistent notification for user notification center"""
    __tablename__ = 'notifications'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    type = Column(String(50), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=False)
    data = Column(JSON, nullable=True)
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)

    user = relationship("User", backref="notifications")

    def __repr__(self):
        return f"<Notification id={self.id} user={self.user_id} type={self.type}>"


class UserActivity(Base):
    """Tracks feature usage for analytics dashboard"""
    __tablename__ = 'user_activity'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    feature = Column(String(30), nullable=False)  # copilot, consultation, academic, pharmacy
    action = Column(String(30), nullable=False)   # chat, generate, rag_chat, create_case, search, etc.
    activity_metadata = Column('metadata', JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    user = relationship("User", backref="activities")

    __table_args__ = (
        Index('ix_user_activity_user_id', 'user_id'),
        Index('ix_user_activity_feature', 'feature'),
        Index('ix_user_activity_created_at', 'created_at'),
        Index('ix_user_activity_user_feature_created', 'user_id', 'feature', 'created_at'),
    )

    def __repr__(self):
        return f"<UserActivity user={self.user_id} feature={self.feature} action={self.action}>"


class CopilotPrompt(Base):
    """Curated copilot suggestion pills (v2). Served via GET /api/copilot/suggested-prompts
    so the pill set can be curated without a frontend deploy. `usage_count` + a UserActivity
    ('suggested_prompt_click') event feed the flywheel signal of which pills users pick."""
    __tablename__ = 'copilot_prompts'

    id = Column(Integer, primary_key=True)
    slug = Column(String(50), unique=True, nullable=False, index=True)  # stable id, e.g. 'study-schedule'
    category = Column(String(30), nullable=True, index=True)
    icon = Column(String(16), nullable=True)  # emoji
    label_key = Column(String(60), nullable=True)  # i18n key for the label (falls back to `label`)
    label = Column(String(120), nullable=False)
    opener = Column(Text, nullable=False)  # prompt opener injected into the chat input
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    sort_order = Column(Integer, default=0, nullable=False)
    weight = Column(Integer, default=1, nullable=False)  # reserved for future weighting / A-B
    usage_count = Column(Integer, default=0, nullable=False)  # flywheel: how often this pill is picked
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index('ix_copilot_prompts_active_sort', 'is_active', 'sort_order'),
    )

    def __repr__(self):
        return f"<CopilotPrompt {self.slug} active={self.is_active} uses={self.usage_count}>"


# =============================================================================
# LGPD MODELS (added 2026-05-27)
# =============================================================================

class ConsentDocumentType(str, enum.Enum):
    """Document types a user can consent to. Each has independent versioning."""
    terms_of_use = "terms_of_use"
    privacy_policy = "privacy_policy"
    # ML training scopes — granular, opt-in, default OFF, 12-month expiry
    ml_training_general = "ml_training_general"
    ml_training_specialty = "ml_training_specialty"
    ml_training_image = "ml_training_image"
    ml_training_voice = "ml_training_voice"
    ml_training_feedback = "ml_training_feedback"
    ml_research_publication = "ml_research_publication"


# Source types that produce training data subject to ML consent.
# Used by data_collector_service to map source -> required consent scope.
ML_TRAINING_SCOPES = frozenset({
    ConsentDocumentType.ml_training_general.value,
    ConsentDocumentType.ml_training_specialty.value,
    ConsentDocumentType.ml_training_image.value,
    ConsentDocumentType.ml_training_voice.value,
    ConsentDocumentType.ml_training_feedback.value,
    ConsentDocumentType.ml_research_publication.value,
})


class ConsentDocument(Base):
    """Immutable consent document. New version = new row with bumped `version`.
    Body is the exact text the user accepted; content_hash proves integrity.
    Soft-deactivation via `is_active=False` retains old versions for audit.
    """
    __tablename__ = 'consent_documents'

    id = Column(Integer, primary_key=True)
    type = Column(Enum(ConsentDocumentType, name='consent_document_type', create_type=False),
                  nullable=False, index=True)
    version = Column(String(20), nullable=False)  # 'v1', 'v2', ...
    locale = Column(String(10), nullable=False, default='pt-BR')  # i18n support
    title = Column(String(200), nullable=False)
    body = Column(Text, nullable=False)
    content_hash = Column(String(64), nullable=False, index=True)  # SHA-256 hex of body
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    default_ttl_days = Column(Integer, nullable=True)  # NULL = no expiry; 365 for ML scopes
    published_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    metadata_info = Column(JSON, nullable=True)

    __table_args__ = (
        UniqueConstraint('type', 'version', 'locale', name='uq_consent_doc_type_version_locale'),
        Index('ix_consent_doc_type_active', 'type', 'is_active'),
    )

    def __repr__(self):
        return f"<ConsentDocument {self.type.value}@{self.version} ({self.locale})>"


class UserConsent(Base):
    """Grant or revocation of consent by a user.
    Each row is either active (revoked_at IS NULL) or revoked.
    A partial unique index ensures only one active grant per (user, type).
    """
    __tablename__ = 'user_consents'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'),
                     nullable=False, index=True)
    document_id = Column(Integer, ForeignKey('consent_documents.id', ondelete='RESTRICT'),
                         nullable=False)
    type = Column(Enum(ConsentDocumentType, name='consent_document_type', create_type=False),
                  nullable=False, index=True)
    version = Column(String(20), nullable=False)
    granted_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=True, index=True)
    actor_ip = Column(String(45), nullable=True)  # IPv6-compatible string (INET would be Postgres-only)
    actor_user_agent = Column(String(500), nullable=True)
    document_hash = Column(String(64), nullable=False)  # snapshot of doc hash at grant time
    scope_metadata = Column(JSON, nullable=True)  # arbitrary context (e.g., specialty filter)

    user = relationship('User', back_populates='consents', foreign_keys=[user_id])
    document = relationship('ConsentDocument')

    __table_args__ = (
        # Active = (revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now()))
        # Partial unique guarantees only one ACTIVE consent per (user, type).
        # Note: SQLAlchemy can't express the time predicate in a unique constraint,
        # so we enforce in application code + the partial index defined in migration.
        Index('ix_user_consents_user_type', 'user_id', 'type'),
        Index('ix_user_consents_active', 'user_id', 'type',
              postgresql_where=Column('revoked_at').is_(None)),
    )

    @property
    def is_active(self) -> bool:
        if self.revoked_at is not None:
            return False
        if self.expires_at is not None and self.expires_at <= datetime.now(timezone.utc):
            return False
        return True

    def __repr__(self):
        state = "active" if self.is_active else "inactive"
        return f"<UserConsent user={self.user_id} {self.type.value}@{self.version} {state}>"


class AuditLog(Base):
    """Append-only audit log of operations on personal data (LGPD Art. 37).

    Inserts only. Updates and deletes are blocked by Postgres trigger
    `audit_log_no_modify` (created in migration). Snapshot of before/after
    state stored as JSONB for forensic review.
    """
    __tablename__ = 'audit_log'

    id = Column(BigInteger, primary_key=True)
    occurred_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                         nullable=False, index=True)

    # Actor (the entity that performed the action)
    actor_user_id = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'),
                           nullable=True, index=True)
    actor_role = Column(String(30), nullable=True)  # 'medico', 'paciente', 'admin', 'system', 'anonymous'
    actor_ip = Column(String(45), nullable=True)
    actor_user_agent = Column(String(500), nullable=True)

    # Action and target
    action = Column(String(80), nullable=False, index=True)
    target_type = Column(String(50), nullable=True, index=True)
    target_id = Column(String(64), nullable=True, index=True)
    affected_user_id = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'),
                              nullable=True, index=True)

    # Optional snapshot of state before/after (JSONB for queryability).
    # Must NEVER contain raw clinical text — use hashes if size is a concern.
    before = Column(JSONB, nullable=True)
    after = Column(JSONB, nullable=True)
    metadata_info = Column(JSONB, nullable=True)

    actor = relationship('User', foreign_keys=[actor_user_id])
    affected = relationship('User', foreign_keys=[affected_user_id])

    __table_args__ = (
        Index('ix_audit_log_action_occurred', 'action', 'occurred_at'),
        Index('ix_audit_log_affected_user', 'affected_user_id', 'occurred_at'),
    )

    def __repr__(self):
        return f"<AuditLog {self.action} target={self.target_type}:{self.target_id} at={self.occurred_at}>"


class DatasetExportLog(Base):
    """Proof of minimization for each ML dataset export.

    Records WHICH consents authorized WHICH records at the time of export.
    Defense against ANPD audit: 'show me the consent for record X'.
    """
    __tablename__ = 'dataset_export_logs'

    id = Column(Integer, primary_key=True)
    exported_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                         nullable=False, index=True)
    exported_by_user_id = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'),
                                 nullable=True)
    export_type = Column(String(40), nullable=False)  # 'sft_jsonl', 'dpo_jsonl', 'dpo_parquet'
    dataset_hash = Column(String(64), nullable=False, index=True)  # SHA-256 of the exported file
    entry_count = Column(Integer, nullable=False)
    anonymization_level = Column(String(20), nullable=False)  # 'pseudo', 'anon', 'mixed'

    # Snapshot of which consents were ACTIVE at export time. Format:
    # {"<user_id>": ["ml_training_general", "ml_training_feedback"], ...}
    consent_snapshot = Column(JSONB, nullable=True)

    # Number of entries excluded due to consent revocation or expiry
    excluded_due_to_revocation = Column(Integer, default=0, nullable=False)
    excluded_due_to_expiry = Column(Integer, default=0, nullable=False)

    # Free-form metadata (filters used, model target, etc.)
    metadata_info = Column(JSONB, nullable=True)

    exporter = relationship('User', foreign_keys=[exported_by_user_id])

    def __repr__(self):
        return f"<DatasetExportLog {self.export_type} {self.entry_count} entries at={self.exported_at}>"


class UserCloudConnection(Base):
    """Conector de nuvem do usuário (Biblioteca Drive-first, 2026-07).

    Vínculo OAuth com a nuvem do PRÓPRIO usuário (v1: Google Drive, scope
    drive.file), onde moram os originais da Biblioteca. O refresh token é
    cifrado em repouso (EncryptedString/Fernet); access tokens NUNCA são
    persistidos (mintados sob demanda em connector_service). status='revoked'
    preserva a linha para auditoria e dispara a UX de reconexão.
    """
    __tablename__ = 'user_cloud_connections'
    __table_args__ = (
        UniqueConstraint('user_id', 'provider', name='uq_cloud_conn_user_provider'),
    )

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    provider = Column(String(20), nullable=False, default='gdrive')
    refresh_token = Column(EncryptedString, nullable=False)
    account_email = Column(String(255), nullable=True)
    root_folder_id = Column(String(128), nullable=True)
    scopes = Column(String(255), nullable=True)
    status = Column(String(20), nullable=False, default='active')  # active | revoked
    connected_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    last_refresh_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship('User')

    def __repr__(self):
        return f"<UserCloudConnection {self.id} user={self.user_id} {self.provider} status={self.status}>"