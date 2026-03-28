import json
import re
from pathlib import Path
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/waitlist", tags=["waitlist"])
WAITLIST_FILE = Path(__file__).parent.parent.parent / "waitlist.json"

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class WaitlistEntry(BaseModel):
    email: str


@router.post("/join")
def join_waitlist(entry: WaitlistEntry):
    email = entry.email.strip().lower()

    if not EMAIL_RE.match(email):
        return {"status": "invalid_email"}

    entries: list[str] = []
    if WAITLIST_FILE.exists():
        try:
            with open(WAITLIST_FILE, "r", encoding="utf-8") as f:
                entries = json.load(f)
        except Exception:
            entries = []

    if email in entries:
        return {"status": "already_registered", "position": entries.index(email) + 1}

    entries.append(email)
    with open(WAITLIST_FILE, "w", encoding="utf-8") as f:
        json.dump(entries, f, indent=2)

    return {"status": "ok", "position": len(entries)}
