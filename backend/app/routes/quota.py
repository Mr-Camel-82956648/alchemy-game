from fastapi import APIRouter, Query

from ..models import AdminQuotaResetRequest, AdminQuotaResetResponse, PlayerQuotaResponse
from ..services.quota_service import admin_reset_or_adjust, get_quota_date, get_quota_snapshot

router = APIRouter(prefix="/api")


@router.get("/player/quota", response_model=PlayerQuotaResponse)
def player_quota(playerId: str = Query(..., min_length=6)):
    snapshot = get_quota_snapshot(playerId)
    return PlayerQuotaResponse(**snapshot)


@router.post("/admin/quota/reset", response_model=AdminQuotaResetResponse)
def admin_quota_reset(req: AdminQuotaResetRequest):
    updated_players = admin_reset_or_adjust(
        player_id=req.playerId,
        apply_to_all=req.applyToAll,
        used_count=req.usedCount,
        daily_limit=req.dailyLimit,
    )
    return AdminQuotaResetResponse(
        updatedPlayers=updated_players,
        quotaDate=get_quota_date(),
        dailyLimit=req.dailyLimit,
    )
