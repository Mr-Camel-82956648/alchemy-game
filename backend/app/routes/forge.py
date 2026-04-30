from fastapi import APIRouter, HTTPException
from ..models import ForgeRequest, ForgeCreateResponse, ForgeStatusResponse
from ..services.forge_service import create_forge_task, get_task_status

router = APIRouter(prefix="/api")


@router.post("/forge", response_model=ForgeCreateResponse)
def start_forge(req: ForgeRequest):
    task_id = create_forge_task(
        spell_a_name=req.spellA.name,
        spell_a_attr=req.spellA.mainAttr,
        spell_a_gen=req.spellA.generation or 1,
        spell_b_name=req.spellB.name,
        spell_b_attr=req.spellB.mainAttr,
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
