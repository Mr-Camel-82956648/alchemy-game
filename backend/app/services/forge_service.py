import os
import random
import threading
import uuid
from typing import Dict, Iterable, List, Optional

from ..models import ForgeResult
from .llm_client import call_gemini_rest

ELEMENTS = ["fire", "ice", "thunder", "blight"]

ELEMENT_PREFIXES = {
    "fire": ["烈焰", "炎煌", "赤焰", "焚天", "灼光", "炎阳"],
    "ice": ["寒冰", "霜华", "冰晶", "凝霜", "极寒", "冻凝"],
    "thunder": ["雷霆", "轰雷", "惊雷", "奔雷", "裂电", "雷鸣"],
    "blight": ["蚀雾", "腐蚀", "枯萎", "瘴毒", "侵蚀", "幽蚀"],
}
ELEMENT_SUFFIXES = {
    "fire": ["焰", "炎", "灼", "烬"],
    "ice": ["霜", "冰", "冽", "寒"],
    "thunder": ["雷", "电", "霆", "鸣"],
    "blight": ["蚀", "毒", "瘴", "蛊"],
}
NAME_TAILS = ["阵", "印", "环", "轮", "契", "咒"]

_tasks: Dict[str, dict] = {}
_lock = threading.Lock()


def calc_base_atk(generation: int) -> float:
    return 100 * (1 + 0.3 * (max(1, generation) - 1))


def normalize_attr(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None

    key = str(value).strip().lower()
    if not key:
        return None

    aliases = {
        "poison": "blight",
        "blight": "blight",
        "fire": "fire",
        "ice": "ice",
        "thunder": "thunder",
    }
    return aliases.get(key, key)


def normalize_attr_set(*groups: Iterable[str]) -> List[str]:
    normalized: List[str] = []
    seen = set()
    for group in groups:
        if group is None:
            continue
        if isinstance(group, (str, bytes)):
            candidates = [group]
        else:
            candidates = list(group)
        for raw in candidates:
            attr = normalize_attr(raw)
            if not attr or attr in seen:
                continue
            seen.add(attr)
            normalized.append(attr)
    return normalized[:3]


def merge_attr_sets(attr_set_a: Iterable[str], attr_set_b: Iterable[str], max_attrs: int = 3) -> List[str]:
    counts: Dict[str, int] = {}
    first_seen: Dict[str, int] = {}
    cursor = 0

    for group in (attr_set_a, attr_set_b):
        for attr in normalize_attr_set(group):
            counts[attr] = counts.get(attr, 0) + 1
            if attr not in first_seen:
                first_seen[attr] = cursor
                cursor += 1

    ranked = sorted(
        counts.keys(),
        key=lambda attr: (-counts[attr], first_seen[attr]),
    )
    return ranked[:max_attrs]


def _generate_fallback_name(attr_set: List[str]) -> str:
    main_attr = attr_set[0] if attr_set else random.choice(ELEMENTS)
    secondary_attr = attr_set[1] if len(attr_set) > 1 else None
    prefix = random.choice(ELEMENT_PREFIXES.get(main_attr, ["秘"]))
    if secondary_attr and secondary_attr in ELEMENT_SUFFIXES:
        suffix = random.choice(ELEMENT_SUFFIXES[secondary_attr])
    else:
        suffix = random.choice(NAME_TAILS)
    tail = random.choice(NAME_TAILS) if len(prefix + suffix) < 4 else ""
    return prefix + suffix + tail


def _is_mechanical_name(name: str, parent_a: str, parent_b: str) -> bool:
    if not name:
        return True

    bad_patterns = ["之阵", "融合", "合成"]
    for pattern in bad_patterns:
        if pattern in name and (parent_a in name or parent_b in name):
            return True
    if "路" in name and (parent_a in name or parent_b in name):
        return True
    if name == parent_a or name == parent_b:
        return True
    if len(parent_a) >= 3 and parent_a in name:
        return True
    if len(parent_b) >= 3 and parent_b in name:
        return True
    return False


def create_forge_task(
    spell_a_name: str,
    spell_a_attr_set: List[str],
    spell_a_gen: int,
    spell_b_name: str,
    spell_b_attr_set: List[str],
    spell_b_gen: int,
) -> str:
    task_id = f"task_{uuid.uuid4().hex[:12]}"

    with _lock:
        _tasks[task_id] = {"status": "pending", "result": None, "error": None}

    print(f"[FORGE] Task created: {task_id}")
    print(f"[FORGE]   parentA: {spell_a_name} (attrs={spell_a_attr_set}, gen={spell_a_gen})")
    print(f"[FORGE]   parentB: {spell_b_name} (attrs={spell_b_attr_set}, gen={spell_b_gen})")

    thread = threading.Thread(
        target=_process_forge,
        args=(
            task_id,
            spell_a_name,
            spell_a_attr_set,
            spell_a_gen,
            spell_b_name,
            spell_b_attr_set,
            spell_b_gen,
        ),
        daemon=True,
    )
    thread.start()
    return task_id


def get_task_status(task_id: str) -> Optional[dict]:
    with _lock:
        return _tasks.get(task_id)


def _process_forge(
    task_id: str,
    spell_a_name: str,
    spell_a_attr_set: List[str],
    spell_a_gen: int,
    spell_b_name: str,
    spell_b_attr_set: List[str],
    spell_b_gen: int,
):
    use_real_llm = os.getenv("FORGE_USE_REAL_LLM", "false").lower() == "true"
    generation = max(spell_a_gen, spell_b_gen) + 1
    merged_attr_set = merge_attr_sets(spell_a_attr_set, spell_b_attr_set)
    if not merged_attr_set:
        merged_attr_set = [random.choice(ELEMENTS)]

    source = "fallback"
    llm_result = None

    if use_real_llm:
        provider = os.getenv("LLM_PROVIDER", "gemini_rest")
        model = os.getenv("LLM_MODEL", "gemini-2.0-flash")
        print(f"[FORGE] [{task_id}] LLM enabled - provider={provider}, model={model}")

        llm_result = call_gemini_rest(
            spell_a_name,
            spell_a_attr_set,
            spell_a_gen,
            spell_b_name,
            spell_b_attr_set,
            spell_b_gen,
            merged_attr_set,
        )

        if llm_result:
            source = "llm"
            if _is_mechanical_name(llm_result["name"], spell_a_name, spell_b_name):
                print(f"[FORGE] [{task_id}] Name warning: '{llm_result['name']}' flagged as mechanical-style, but preserved under llm-first policy")
            print(f"[FORGE] [{task_id}] LLM SUCCESS - name={llm_result['name']}, source=llm")
        else:
            print(f"[FORGE] [{task_id}] LLM FAILED - falling back to local naming")
    else:
        print(f"[FORGE] [{task_id}] FORGE_USE_REAL_LLM=false - using local naming")

    if llm_result:
        name = llm_result["name"]
        visual_desc = llm_result.get("visualDesc", "")
        fusion_prompt = llm_result.get("fusionPrompt", "")
    else:
        name = _generate_fallback_name(merged_attr_set)
        visual_desc = None
        fusion_prompt = None

    main_attr = merged_attr_set[0]
    sub_attr = merged_attr_set[1] if len(merged_attr_set) > 1 else None

    result = ForgeResult(
        name=name,
        attrSet=merged_attr_set,
        mainAttr=main_attr,
        subAttr=sub_attr,
        element=main_attr,
        generation=generation,
        baseAtk=calc_base_atk(generation),
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

    print(f"[FORGE] [{task_id}] COMPLETED - name={name}, attrSet={merged_attr_set}, source={source}")
