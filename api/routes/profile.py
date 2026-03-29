import json
from pathlib import Path
from typing import Annotated
from fastapi import APIRouter, Header
from pydantic import BaseModel

router = APIRouter(prefix="/profile", tags=["profile"])

PORTFOLIOS_DIR = Path(__file__).parent.parent.parent / "portfolios"


def _profile_path(token: str) -> Path:
    d = PORTFOLIOS_DIR / token
    d.mkdir(parents=True, exist_ok=True)
    return d / "profile.json"


def _load_profile(token: str) -> dict | None:
    path = _profile_path(token)
    if not path.exists():
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


class Profile(BaseModel):
    risk_appetite: str   # conservative | balanced | growth
    goal: str            # long_term_growth | income | preservation
    time_horizon: str    # <2 | 2-5 | 5-10 | 10+


@router.get("")
def get_profile(x_portfolio_token: Annotated[str, Header()]):
    profile = _load_profile(x_portfolio_token)
    if profile is None:
        return {"exists": False}
    return {"exists": True, **profile}


@router.post("")
def save_profile(profile: Profile, x_portfolio_token: Annotated[str, Header()]):
    path = _profile_path(x_portfolio_token)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(profile.model_dump(), f, indent=2)
    return {"status": "ok"}
