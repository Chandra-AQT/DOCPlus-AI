"""
guest_activity.py — Activity log for guest users.
Every significant action is recorded for admin visibility.
"""
from sqlalchemy import Column, String, DateTime, Text
from sqlalchemy.sql import func
import uuid
from app.core.database import Base


def gen_uuid():
    return str(uuid.uuid4())


class GuestActivity(Base):
    __tablename__ = "guest_activity"

    id         = Column(String,   primary_key=True, default=gen_uuid)
    guest_id   = Column(String,   nullable=False, index=True)
    action     = Column(String,   nullable=False)   # crawl_url | pdf_fetch | extraction | export_attempt | access_request
    detail     = Column(Text,     nullable=True)    # URL, filename, engine used, etc.
    created_at = Column(DateTime, server_default=func.now())


class GuestAccessRequest(Base):
    __tablename__ = "guest_access_requests"

    id         = Column(String,   primary_key=True, default=gen_uuid)
    guest_id   = Column(String,   nullable=False, index=True)
    request_type = Column(String, nullable=False)   # pdf_fetch | extraction | export | full_access
    note       = Column(Text,     nullable=True)
    status     = Column(String,   default="pending")  # pending | approved | declined
    created_at = Column(DateTime, server_default=func.now())
    resolved_at = Column(DateTime, nullable=True)
