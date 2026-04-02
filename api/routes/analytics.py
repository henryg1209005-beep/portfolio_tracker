from fastapi import APIRouter, Header
from pydantic import BaseModel, Field

from api import db

router = APIRouter(prefix="/analytics", tags=["analytics"])


class AnalyticsEvent(BaseModel):
    event_name: str = Field(min_length=1, max_length=100)
    properties: dict = Field(default_factory=dict)


@router.post("/event")
def capture_event(payload: AnalyticsEvent, x_portfolio_token: str | None = Header(default=None)):
    db.save_analytics_event(x_portfolio_token, payload.event_name.strip(), payload.properties)
    return {"status": "ok"}
