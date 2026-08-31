"""
guest.py — Guest User model for DOCPlus AI+ trial access.
Guests register without a password. Usage is tracked per email.
"""
from sqlalchemy import Column, String, DateTime, Integer, Text, Boolean
from sqlalchemy.sql import func
import uuid
from app.core.database import Base


def gen_uuid():
    return str(uuid.uuid4())


class Guest(Base):
    __tablename__ = "guests"

    id           = Column(String,  primary_key=True, default=gen_uuid)
    email        = Column(String,  unique=True, nullable=False, index=True)
    first_name   = Column(String,  nullable=False)
    middle_name  = Column(String,  nullable=True,  default="")
    last_name    = Column(String,  nullable=False)
    current_role = Column(String,  nullable=True,  default="")
    company      = Column(String,  nullable=True,  default="")
    note         = Column(Text,    nullable=True,  default="")

    # Trial usage counters
    pdf_fetched      = Column(Integer, default=0)  # PDFs sent to library (limit: 5)
    extractions_used = Column(Integer, default=0)  # PDFs extracted (limit: 2)

    # Trial limits (admin can override)
    pdf_fetch_limit      = Column(Integer, default=5)
    extraction_limit     = Column(Integer, default=2)

    # Permissions granted by admin
    upload_allowed = Column(Boolean, default=False)  # Manual file upload (off by default)
    export_allowed = Column(Boolean, default=False)  # Export results (off by default)

    # Email quality signals — useful for sales outreach
    is_business_email = Column(Boolean, default=True)   # False = gmail/yahoo/hotmail etc.
    email_verified    = Column(Boolean, default=False)  # True = SMTP RCPT TO confirmed valid

    # Session token (simple UUID, no password)
    session_token = Column(String, nullable=True, index=True)

    is_active    = Column(Boolean, default=True)
    created_at   = Column(DateTime, server_default=func.now())
    last_seen    = Column(DateTime, nullable=True)

    @property
    def pdf_remaining(self):
        return max(0, self.pdf_fetch_limit - self.pdf_fetched)

    @property
    def extraction_remaining(self):
        return max(0, self.extraction_limit - self.extractions_used)

    @property
    def full_name(self):
        parts = [self.first_name, self.middle_name, self.last_name]
        return " ".join(p for p in parts if p)
