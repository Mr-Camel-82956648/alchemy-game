from fastapi import APIRouter, HTTPException

from ..models import PixVerseTask
from ..services.video_generation_service import create_video_task_from_forge_task, get_video_task

router = APIRouter(prefix="/api/video/pixverse", tags=["pixverse"])


@router.post("/from-forge/{forge_task_id}", response_model=PixVerseTask)
def start_pixverse_from_forge(forge_task_id: str):
    try:
        return create_video_task_from_forge_task(forge_task_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/status/{video_task_id}", response_model=PixVerseTask)
def get_pixverse_status(video_task_id: str):
    task = get_video_task(video_task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="PixVerse task not found")
    return task
