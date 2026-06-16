from fastapi import APIRouter, HTTPException

from ..models import AIConfigTestRequest, AIConfigTestResponse, ForgeCreateResponse, ForgeRequest, ForgeStatusResponse
from ..services.ai_config_service import AIConfigError, resolve_request_llm_override, test_ai_config
from ..services.forge_service import create_forge_task, get_task_status
from ..services.quota_service import QuotaExceededError, consume_quota_or_raise, get_quota_snapshot

router = APIRouter(prefix="/api")


def _resolve_spell_payload(spell, slot: str):
    if spell is None:
        return None

    attr_set = list(spell.attrSet or [])
    if not attr_set and spell.mainAttr:
        attr_set = [spell.mainAttr]

    name = (spell.name or "").strip()
    theme_text = (spell.themeText or "").strip()
    spell_type = (spell.type or "").strip() or None

    if not any([name, theme_text, attr_set]):
        return None

    return {
        "slot": slot,
        "id": spell.id,
        "type": spell_type,
        "name": name,
        "attr_set": attr_set,
        "theme_text": theme_text,
        "generation": spell.generation or 1,
    }


@router.post("/forge", response_model=ForgeCreateResponse)
def start_forge(req: ForgeRequest):
    spell_a = _resolve_spell_payload(req.spellA, "A")
    spell_b = _resolve_spell_payload(req.spellB, "B")
    has_any_input = bool(spell_a or spell_b)

    try:
        llm_config = resolve_request_llm_override(req.aiConfig)
    except AIConfigError as exc:
        raise HTTPException(
            status_code=401,
            detail={"code": "ai_config_invalid", "message": str(exc)},
        ) from exc

    try:
        if has_any_input:
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

    task_id = create_forge_task(spell_a=spell_a, spell_b=spell_b, llm_config=llm_config)
    return ForgeCreateResponse(taskId=task_id, status="pending")


@router.post("/ai-config/test", response_model=AIConfigTestResponse)
async def test_ai_engine(req: AIConfigTestRequest):
    try:
        return await test_ai_config(req.aiConfig)
    except AIConfigError as exc:
        raise HTTPException(
            status_code=400,
            detail={"code": "ai_config_invalid", "message": str(exc)},
        ) from exc


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
