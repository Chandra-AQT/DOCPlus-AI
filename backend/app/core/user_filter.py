"""
user_filter.py — Utilities for per-user data isolation.
"""
from __future__ import annotations
from typing import Optional
from sqlalchemy.orm import Query
from app.models.user import User


def filter_by_user(query: Query, user: Optional[User], model) -> Query:
    """
    Filter a SQLAlchemy query to only return records owned by the user.
    - Admins: see all except null-owner sample PDFs
    - Guests: see own records + sample PDFs (so they can poll parsing status)
    - Anonymous: see null-owner records except sample PDFs
    """
    if user is None:
        q = query.filter(model.user_id == None)  # noqa: E711
        if hasattr(model, 'upload_source'):
            q = q.filter(model.upload_source != 'sample')
        return q

    if user.is_admin:
        if hasattr(model, 'upload_source'):
            from sqlalchemy import or_
            return query.filter(
                or_(
                    model.user_id != None,            # noqa: E711
                    model.upload_source != 'sample',
                )
            )
        return query

    # Authenticated non-admin: own records + sample PDFs
    if hasattr(model, 'upload_source'):
        from sqlalchemy import or_
        return query.filter(
            or_(
                model.user_id == user.id,
                model.upload_source == 'sample',
            )
        )
    return query.filter(model.user_id == user.id)


def owned_by(user: Optional[User], record) -> bool:
    """Check if a user owns a record (or is admin)."""
    record_user_id = getattr(record, "user_id", None)
    upload_source  = getattr(record, "upload_source", None)
    if user is None:
        return record_user_id is None
    if user.is_admin:
        return True
    if record_user_id == user.id:
        return True
    # Guests can access sample PDFs
    if record_user_id is None and upload_source == 'sample':
        return True
    return False
