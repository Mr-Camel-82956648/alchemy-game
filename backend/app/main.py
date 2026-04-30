import os
import logging
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes.forge import router as forge_router

env_path = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(env_path)

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


@app.get("/")
def root():
    use_llm = os.getenv("FORGE_USE_REAL_LLM", "false")
    provider = os.getenv("LLM_PROVIDER", "gemini_rest")
    model = os.getenv("LLM_MODEL", "gemini-2.0-flash")
    return {
        "message": "Alchemy Game Backend",
        "status": "running",
        "forge_use_real_llm": use_llm,
        "llm_provider": provider,
        "llm_model": model,
    }
