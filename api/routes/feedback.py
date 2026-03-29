import json
from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/feedback", tags=["feedback"])
FEEDBACK_FILE = Path(__file__).parent.parent.parent / "feedback.json"


class FeedbackEntry(BaseModel):
    message: str
    rating: int | None = None  # 1–5, optional
    token: str | None = None   # portfolio token for context


@router.post("/submit")
def submit_feedback(entry: FeedbackEntry):
    message = entry.message.strip()
    if not message:
        return {"status": "empty"}

    entries: list = []
    if FEEDBACK_FILE.exists():
        try:
            with open(FEEDBACK_FILE, "r", encoding="utf-8") as f:
                entries = json.load(f)
        except Exception:
            entries = []

    entries.append({
        "message": message,
        "rating": entry.rating,
        "token": entry.token,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    with open(FEEDBACK_FILE, "w", encoding="utf-8") as f:
        json.dump(entries, f, indent=2)

    return {"status": "ok"}
