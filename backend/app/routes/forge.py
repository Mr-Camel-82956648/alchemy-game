from fastapi import APIRouter, HTTPException

from ..models import ForgeCreateResponse, ForgeRequest, ForgeStatusResponse
from ..services.forge_service import create_forge_task, get_task_status
from ..services.quota_service import QuotaExceededError, consume_quota_or_raise, get_quota_snapshot

router = APIRouter(prefix="/api")


def _resolve_attr_set(spell):
    if spell.attrSet:
        return spell.attrSet
    if spell.mainAttr:
        return [spell.mainAttr]
    return []


@router.post("/forge", response_model=ForgeCreateResponse)
def start_forge(req: ForgeRequest):
    try:
        consume_quota_or_raise(req.playerId)
    except QuotaExceededError as exc:
        quota = get_quota_snapshot(req.playerId)
        raise HTTPException(
            status_code=429,
            detail={
                "code": "quota_exhausted",
                "message": str(exc),
                "quota": quota,
            },
        ) from exc

    task_id = create_forge_task(
        spell_a_name=req.spellA.name,
        spell_a_attr_set=_resolve_attr_set(req.spellA),
        spell_a_gen=req.spellA.generation or 1,
        spell_b_name=req.spellB.name,
        spell_b_attr_set=_resolve_attr_set(req.spellB),
        spell_b_gen=req.spellB.generation or 1,
    )
    return ForgeCreateResponse(taskId=task_id, status="pending")


@router.get("/forge/status/{task_id}", response_model=ForgeStatusResponse)
def forge_status(task_id: str):
    task = get_task_status(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")

    return ForgeStatusResponse(
        taskId=task_id,
        status=task["status"],
        result=task["result"],
        error=task.get("error"),
    )
