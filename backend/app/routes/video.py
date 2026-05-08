from fastapi import APIRouter, HTTPException

from ..models import (
    CardVideoRegistrationRequest,
    CardVideoStatus,
    CardVideoStatusListResponse,
    PixVerseTask,
)
from ..services.card_asset_service import get_player_generated_asset_by_card, register_generated_cards
from ..services.video_generation_service import (
    create_video_task_from_card,
    create_video_task_from_forge_task,
    get_video_task,
)

router = APIRouter(prefix="/api/video/pixverse", tags=["pixverse"])


@router.post("/from-forge/{forge_task_id}", response_model=PixVerseTask)
def start_pixverse_from_forge(forge_task_id: str):
    try:
        return create_video_task_from_forge_task(forge_task_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/cards/register", response_model=CardVideoStatusListResponse)
def register_pixverse_cards(req: CardVideoRegistrationRequest):
    cards = register_generated_cards([item.model_dump() for item in req.cards])
    return CardVideoStatusListResponse(count=len(cards), cards=cards)


@router.get("/card/{card_id}", response_model=CardVideoStatus)
def get_pixverse_card_status(card_id: str):
    asset = get_player_generated_asset_by_card(card_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Card video asset not found")
    return asset


@router.post("/from-card/{card_id}", response_model=CardVideoStatus)
def start_pixverse_from_card(card_id: str):
    asset = get_player_generated_asset_by_card(card_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Card video asset not registered yet")
    if asset.get("status") == "completed" and asset.get("resultUrl"):
        return asset
    try:
        create_video_task_from_card(card_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    latest = get_player_generated_asset_by_card(card_id)
    if latest is None:
        raise HTTPException(status_code=500, detail="Card video asset disappeared after start")
    return latest


@router.get("/status/{video_task_id}", response_model=PixVerseTask)
def get_pixverse_status(video_task_id: str):
    task = get_video_task(video_task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="PixVerse task not found")
    return task
