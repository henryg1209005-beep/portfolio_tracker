from fastapi import APIRouter
from pydantic import BaseModel

from api import db

router = APIRouter(prefix="/feedback", tags=["feedback"])


class FeedbackEntry(BaseModel):
    message: str
    rating: int | None = None
    token: str | None = None


@router.post("/submit")
def submit_feedback(entry: FeedbackEntry):
    message = entry.message.strip()
    if not message:
        return {"status": "empty"}
    db.save_feedback(message, entry.rating, entry.token)
    return {"status": "ok"}
