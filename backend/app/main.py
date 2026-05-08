import json
import os
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from alchemy_glyph_router.env_config import build_runtime_snapshot, ensure_repo_env_loaded

from .routes.debug import router as debug_router
from .routes.forge import router as forge_router
from .routes.quota import router as quota_router
from .routes.video import router as video_router

ensure_repo_env_loaded()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)

app = FastAPI(title="Alchemy Game Backend", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(forge_router)
app.include_router(quota_router)
app.include_router(debug_router)
app.include_router(video_router)

runtime_logger = logging.getLogger("forge.runtime")


@app.on_event("startup")
def log_runtime_snapshot():
    runtime_logger.info(
        "llm.runtime_snapshot %s",
        json.dumps(build_runtime_snapshot(), ensure_ascii=False, separators=(",", ":")),
    )


@app.get("/")
def root():
    use_llm = os.getenv("FORGE_USE_REAL_LLM", "false")
    snapshot = build_runtime_snapshot()
    return {
        "message": "Alchemy Game Backend",
        "status": "running",
        "forge_use_real_llm": use_llm,
        "llm_provider": snapshot["forge"]["provider"],
        "llm_model": snapshot["forge"]["model"],
        "llm_fallback_provider": snapshot["forgeFallback"]["provider"],
        "llm_fallback_model": snapshot["forgeFallback"]["model"],
        "glyph_router_model": snapshot["glyphRouter"]["model"],
        "llm_config_aligned": snapshot["aligned"],
    }
