# backend/alembic/versions/2026_05_26_drop_blog_posts.py
"""Drop blog_posts table

Revision ID: 2026_05_26_drop_blog
Revises: 2026_03_15_doc_images
Create Date: 2026-05-26

Removes blog system entirely (admin-managed posts, public reading, landing-page cards).
The feature was never used by real readers and added maintenance overhead for no traction.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = '2026_05_26_drop_blog'
down_revision = '2026_03_15_doc_images'
branch_labels = None
depends_on = None


def table_exists(table_name):
    bind = op.get_bind()
    inspector = inspect(bind)
    return table_name in inspector.get_table_names()


def upgrade():
    if table_exists('blog_posts'):
        op.drop_table('blog_posts')


def downgrade():
    if not table_exists('blog_posts'):
        op.create_table(
            'blog_posts',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('author_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('slug', sa.String(255), unique=True, nullable=False, index=True),
            sa.Column('title', sa.String(255), nullable=False),
            sa.Column('summary', sa.String(500), nullable=True),
            sa.Column('content', sa.Text(), nullable=False),
            sa.Column('cover_image', sa.String(500), nullable=True),
            sa.Column('tags', sa.JSON(), nullable=True),
            sa.Column('category', sa.String(100), nullable=True),
            sa.Column('meta_title', sa.String(100), nullable=True),
            sa.Column('meta_description', sa.String(200), nullable=True),
            sa.Column('status', sa.String(20), default='draft', index=True),
            sa.Column('published_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('view_count', sa.Integer(), default=0),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
        )
