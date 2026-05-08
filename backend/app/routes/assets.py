from fastapi import APIRouter, HTTPException, Query

from ..models import CardAssetListResponse, CardVideoStatus
from ..services.card_asset_service import get_card_asset, list_card_assets

router = APIRouter(prefix="/api/assets", tags=["assets"])


@router.get("/cards", response_model=CardAssetListResponse)
def list_cards(sourceType: str | None = Query(default=None)):
    assets = list_card_assets(source_type=sourceType)
    return CardAssetListResponse(count=len(assets), assets=assets)


@router.get("/cards/{asset_id}", response_model=CardVideoStatus)
def get_card_asset_detail(asset_id: str):
    asset = get_card_asset(asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Card asset not found")
    return asset
