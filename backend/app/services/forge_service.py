import os
import uuid
import random
import threading
from typing import Dict, Optional

from ..models import ForgeResult
from .llm_client import call_gemini_rest

ELEMENTS = ["fire", "ice", "thunder", "blight"]

ELEMENT_PREFIXES = {
    "fire":    ["烈焰", "炎煌", "赤焰", "焚天", "灼光", "炽阳"],
    "ice":     ["寒冰", "霜华", "冰晶", "凝霜", "极寒", "冻凝"],
    "thunder": ["雷霆", "轰雷", "惊雷", "奔雷", "裂电", "霹雳"],
    "blight":  ["蚀暗", "幽蚀", "枯萎", "瘴毒", "朽蚀", "侵蚀"],
}
ELEMENT_SUFFIXES = {
    "fire":    ["焰", "炎", "煌", "燃"],
    "ice":     ["霜", "冰", "凝", "寒"],
    "thunder": ["雷", "电", "鸣", "震"],
    "blight":  ["蚀", "毒", "朽", "瘴"],
}
NAME_TAILS = ["阵", "咒", "环", "轮", "印", "诀"]

_tasks: Dict[str, dict] = {}
_lock = threading.Lock()


def calc_base_atk(generation: int) -> float:
    return 100 * (1 + 0.3 * (max(1, generation) - 1))


def _generate_fallback_name(main_attr: str, sub_attr: Optional[str]) -> str:
    prefix = random.choice(ELEMENT_PREFIXES.get(main_attr, ["法"]))
    if sub_attr and sub_attr in ELEMENT_SUFFIXES:
        suffix = random.choice(ELEMENT_SUFFIXES[sub_attr])
    else:
        suffix = random.choice(NAME_TAILS)
    tail = random.choice(NAME_TAILS) if len(prefix + suffix) < 4 else ""
    return prefix + suffix + tail


def _is_mechanical_name(name: str, parent_a: str, parent_b: str) -> bool:
    """检测名称是否为机械拼接。"""
    if not name:
        return True
    bad_patterns = ["之阵", "融合", "合成"]
    for p in bad_patterns:
        if p in name and (parent_a in name or parent_b in name):
            return True
    if "·" in name and (parent_a in name or parent_b in name):
        return True
    if name == parent_a or name == parent_b:
        return True
    if len(parent_a) >= 3 and parent_a in name:
        return True
    if len(parent_b) >= 3 and parent_b in name:
        return True
    return False


def create_forge_task(spell_a_name: str, spell_a_attr: Optional[str],
                      spell_a_gen: int,
                      spell_b_name: str, spell_b_attr: Optional[str],
                      spell_b_gen: int) -> str:
    task_id = f"task_{uuid.uuid4().hex[:12]}"

    with _lock:
        _tasks[task_id] = {"status": "pending", "result": None, "error": None}

    print(f"[FORGE] Task created: {task_id}")
    print(f"[FORGE]   parentA: {spell_a_name} ({spell_a_attr}, gen={spell_a_gen})")
    print(f"[FORGE]   parentB: {spell_b_name} ({spell_b_attr}, gen={spell_b_gen})")

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
        print(f"[FORGE] [{task_id}] LLM enabled — provider={provider}, model={model}")

        llm_result = call_gemini_rest(
            spell_a_name, spell_a_attr, spell_a_gen,
            spell_b_name, spell_b_attr, spell_b_gen,
        )

        if llm_result:
            source = "llm"
            if _is_mechanical_name(llm_result["name"], spell_a_name, spell_b_name):
                print(f"[FORGE] [{task_id}] Name warning: '{llm_result['name']}' flagged as mechanical-style, but preserved under llm-first policy")
            print(f"[FORGE] [{task_id}] LLM SUCCESS — name={llm_result['name']}, source=llm")
        else:
            print(f"[FORGE] [{task_id}] LLM FAILED — falling back to mock")
    else:
        print(f"[FORGE] [{task_id}] FORGE_USE_REAL_LLM=false — using mock")

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
        name = _generate_fallback_name(main_attr, sub_attr)
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

    print(f"[FORGE] [{task_id}] COMPLETED — name={name}, mainAttr={main_attr}, source={source}")
