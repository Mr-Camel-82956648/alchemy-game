from fastapi import APIRouter, Query

from alchemy_glyph_router.env_config import build_runtime_snapshot

from ..models import PixVerseConfigResponse, PixVerseTaskListResponse
from ..services.video_generation_service import get_pixverse_config_snapshot, list_video_tasks

router = APIRouter(prefix="/api/debug", tags=["debug"])


@router.get("/llm-config")
def debug_llm_config():
    return build_runtime_snapshot()


@router.get("/pixverse/config", response_model=PixVerseConfigResponse)
def debug_pixverse_config():
    return get_pixverse_config_snapshot()


@router.get("/pixverse/tasks", response_model=PixVerseTaskListResponse)
def debug_pixverse_tasks(
    limit: int = Query(default=20, ge=1, le=100),
    forgeTaskId: str | None = Query(default=None),
):
    tasks = list_video_tasks(limit=limit, forge_task_id=forgeTaskId)
    return PixVerseTaskListResponse(count=len(tasks), tasks=tasks)
