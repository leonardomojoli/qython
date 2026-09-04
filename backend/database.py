import logging
import os
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import sessionmaker

from .config import Config
# Import all models so that Base knows about them
from . import models
from .db_base import Base

logger = logging.getLogger("qython_logger")

# Check if the database URL is set
SQLALCHEMY_DATABASE_URI = Config.SQLALCHEMY_DATABASE_URI
if not SQLALCHEMY_DATABASE_URI:
    logger.critical("DATABASE_URL environment variable is not set. Application cannot start.")
    raise ValueError("No DATABASE_URL configured.")

# Ensure we use the async driver and fix asyncpg compatibility
if SQLALCHEMY_DATABASE_URI and SQLALCHEMY_DATABASE_URI.startswith("postgresql://"):
    SQLALCHEMY_DATABASE_URI = SQLALCHEMY_DATABASE_URI.replace("postgresql://", "postgresql+asyncpg://", 1)

# asyncpg doesn't accept 'sslmode' parameter - it uses 'ssl' instead
# Remove sslmode from query string if present
if "sslmode=" in SQLALCHEMY_DATABASE_URI:
    from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
    
    parsed = urlparse(SQLALCHEMY_DATABASE_URI)
    query_params = parse_qs(parsed.query)
    
    # Remove sslmode parameter (asyncpg handles SSL differently)
    query_params.pop('sslmode', None)
    
    # Reconstruct URL without sslmode
    new_query = urlencode(query_params, doseq=True)
    SQLALCHEMY_DATABASE_URI = urlunparse((
        parsed.scheme,
        parsed.netloc,
        parsed.path,
        parsed.params,
        new_query,
        parsed.fragment
    ))

# Create Async Engine
engine = create_async_engine(
    SQLALCHEMY_DATABASE_URI,
    pool_pre_ping=True,
    echo=False,
    pool_size=20,
    max_overflow=10,
    pool_recycle=3600,
    pool_timeout=30,
)

# Create Async Session Factory
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency to get an Async DB session for a request."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()

async def create_tables():
    """Creates all database tables based on the models (Async)."""
    logger.info("Creating database tables if they don't exist...")
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Tables created successfully (if they didn't already exist).")
    except Exception as e:
        logger.error(f"An error occurred during table creation: {e}", exc_info=True)
        raise
