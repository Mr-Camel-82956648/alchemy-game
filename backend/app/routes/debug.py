from fastapi import APIRouter

from alchemy_glyph_router.env_config import build_runtime_snapshot

router = APIRouter(prefix="/api/debug", tags=["debug"])


@router.get("/llm-config")
def debug_llm_config():
    return build_runtime_snapshot()
