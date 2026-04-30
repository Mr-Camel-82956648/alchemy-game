import os
import uuid
import random
import threading
import logging
from typing import Dict, Optional

from ..models import ForgeResult
from .llm_client import call_gemini_rest

logger = logging.getLogger("forge.service")

ELEMENTS = ["fire", "ice", "thunder", "blight"]

_tasks: Dict[str, dict] = {}
_lock = threading.Lock()


def calc_base_atk(generation: int) -> float:
    return 100 * (1 + 0.3 * (max(1, generation) - 1))


def create_forge_task(spell_a_name: str, spell_a_attr: Optional[str],
                      spell_a_gen: int,
                      spell_b_name: str, spell_b_attr: Optional[str],
                      spell_b_gen: int) -> str:
    task_id = f"task_{uuid.uuid4().hex[:12]}"

    with _lock:
        _tasks[task_id] = {"status": "pending", "result": None, "error": None}

    thread = threading.Thread(
        target=_process_forge,
        args=(task_id, spell_a_name, spell_a_attr, spell_a_gen,
              spell_b_name, spell_b_attr, spell_b_gen),
        daemon=True,
    )
    thread.start()
    return task_id


def get_task_status(task_id: str) -> Optional[dict]:
    with _lock:
        return _tasks.get(task_id)


def _process_forge(task_id: str,
                   spell_a_name: str, spell_a_attr: Optional[str],
                   spell_a_gen: int,
                   spell_b_name: str, spell_b_attr: Optional[str],
                   spell_b_gen: int):
    use_real_llm = os.getenv("FORGE_USE_REAL_LLM", "false").lower() == "true"
    gen = max(spell_a_gen, spell_b_gen) + 1

    source = "fallback"
    llm_result = None

    if use_real_llm:
        provider = os.getenv("LLM_PROVIDER", "gemini_rest")
        model = os.getenv("LLM_MODEL", "gemini-2.0-flash")
        logger.info(
            "[%s] LLM enabled — provider=%s, model=%s",
            task_id, provider, model,
        )

        llm_result = call_gemini_rest(
            spell_a_name, spell_a_attr, spell_a_gen,
            spell_b_name, spell_b_attr, spell_b_gen,
        )

        if llm_result:
            source = "llm"
            logger.info("[%s] LLM succeeded: name=%s", task_id, llm_result["name"])
        else:
            logger.warning("[%s] LLM failed, falling back to mock", task_id)
    else:
        logger.info("[%s] FORGE_USE_REAL_LLM=false, using mock", task_id)

    if llm_result:
        name = llm_result["name"]
        main_attr = llm_result["mainAttr"]
        sub_attr = llm_result["subAttr"]
        visual_desc = llm_result.get("visualDesc", "")
        fusion_prompt = llm_result.get("fusionPrompt", "")
    else:
        main_attr = random.choice(ELEMENTS)
        remaining = [e for e in ELEMENTS if e != main_attr]
        sub_attr = random.choice(remaining) if remaining else None
        name = f"{spell_a_name}·{spell_b_name}之阵"
        visual_desc = None
        fusion_prompt = None

    result = ForgeResult(
        name=name,
        mainAttr=main_attr,
        subAttr=sub_attr,
        element=main_attr,
        generation=gen,
        baseAtk=calc_base_atk(gen),
        videoUrl=None,
        status="partial",
        visualDesc=visual_desc,
        fusionPrompt=fusion_prompt,
        source=source,
    )

    with _lock:
        if task_id in _tasks:
            _tasks[task_id]["status"] = "completed"
            _tasks[task_id]["result"] = result
            logger.info("[%s] Task completed — source=%s", task_id, source)
