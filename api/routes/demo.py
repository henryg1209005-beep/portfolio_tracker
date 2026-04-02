import re
import pydantic
from fastapi import APIRouter, HTTPException

from api import db

router = APIRouter(prefix="/demo", tags=["demo"])

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class _RegisterBody(pydantic.BaseModel):
    email: str


@router.post("/register")
def register(body: _RegisterBody):
    """Capture a demo email and return success. No auth required."""
    email = (body.email or "").strip().lower()
    if not email or not _EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="Invalid email address")
    db.save_demo_email(email)
    return {"status": "ok"}
