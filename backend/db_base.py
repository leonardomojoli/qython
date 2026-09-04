# qython/backend/db_base.py

from sqlalchemy.ext.declarative import declarative_base

# This Base will be shared by models.py and database.py
Base = declarative_base()
