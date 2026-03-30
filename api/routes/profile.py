from typing import Annotated
from fastapi import APIRouter, Header
from pydantic import BaseModel

from api import db

router = APIRouter(prefix="/profile", tags=["profile"])


def _load_profile(token: str) -> dict | None:
    """Public helper used by ai.py."""
    return db.load_profile(token)


class Profile(BaseModel):
    risk_appetite: str   # conservative | balanced | growth
    goal: str            # long_term_growth | income | preservation
    time_horizon: str    # <2 | 2-5 | 5-10 | 10+


@router.get("")
def get_profile(x_portfolio_token: Annotated[str, Header()]):
    profile = db.load_profile(x_portfolio_token)
    if profile is None:
        return {"exists": False}
    return {"exists": True, **profile}


@router.post("")
def save_profile(profile: Profile, x_portfolio_token: Annotated[str, Header()]):
    db.save_profile(
        x_portfolio_token,
        profile.risk_appetite,
        profile.goal,
        profile.time_horizon,
    )
    return {"status": "ok"}
