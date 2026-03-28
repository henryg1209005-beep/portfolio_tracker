import uuid
from fastapi import APIRouter

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/token")
def create_token():
    """Generate a new unique portfolio token."""
    return {"token": str(uuid.uuid4())}
