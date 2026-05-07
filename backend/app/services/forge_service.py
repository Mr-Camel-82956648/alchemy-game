import json
import logging
import os
import random
import threading
import time
import uuid
from typing import Dict, Iterable, List, Optional

from ..models import ForgeResult
from .llm_client import call_forge_semantic_llm
from .prompt_router_service import build_prompt_fallback, run_prompt_router

logger = logging.getLogger("forge.service")

ELEMENTS = ["fire", "ice", "thunder", "blight"]
ELEMENT_LABELS = {
    "fire": "火焰",
    "ice": "寒冰",
    "thunder": "雷电",
    "blight": "蚀毒",
}

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

ATTR_KEYWORDS = {
    "fire": [
        "fire", "flame", "ember", "blaze", "burn", "magma", "lava", "pyro",
        "火", "炎", "焰", "熔", "岩浆", "爆燃", "灼", "赤", "烬", "热",
    ],
    "ice": [
        "ice", "frost", "snow", "freeze", "frozen", "glacier", "crystal",
        "冰", "霜", "雪", "寒", "冻", "凌", "晶", "冷",
    ],
    "thunder": [
        "thunder", "lightning", "storm", "bolt", "shock", "spark",
        "雷", "电", "霆", "闪", "暴风", "风暴", "惊雷",
    ],
    "blight": [
        "blight", "poison", "venom", "toxic", "plague", "rot", "decay", "corrupt",
        "毒", "瘴", "蚀", "腐", "枯", "腐朽", "疫", "污",
    ],
}

DEFAULT_OPENING_POOL = [
    {
        "name": "熔岩法阵",
        "attrSet": ["fire"],
        "themeText": "一枚熔岩主题的炼金法阵贴地展开，中心像被压缩的熔火核心般稳定脉动，边界清晰，热辉与碎火在受控范围内流转。",
        "generation": 1,
    },
    {
        "name": "冰凌法阵",
        "attrSet": ["ice"],
        "themeText": "一枚冰凌主题的炼金法阵贴地成形，中央凝出锐利冰晶与寒雾旋纹，整体冷冽、收束、带有清晰的俯视技能边界。",
        "generation": 1,
    },
    {
        "name": "星环法阵",
        "attrSet": ["thunder"],
        "themeText": "一枚星环雷电主题的炼金法阵在地面亮起，圆环与电弧彼此咬合，中心能量核短促跃动，呈现明亮而克制的放电感。",
        "generation": 1,
    },
    {
        "name": "剧毒法阵",
        "attrSet": ["blight"],
        "themeText": "一枚剧毒蚀雾主题的炼金法阵在地面缓慢展开，边界内弥散低伏毒烟与幽绿腐蚀辉光，整体压抑、阴蚀且受控。",
        "generation": 1,
    },
]

_tasks: Dict[str, dict] = {}
_lock = threading.Lock()


def _json_log(payload: dict) -> str:
    return json.dumps(payload, ensure_ascii=False, default=str, separators=(",", ":"))


def _truncate_text(value: Optional[str], max_length: int = 220) -> Optional[str]:
    text = str(value or "").strip()
    if not text:
        return None
    if len(text) <= max_length:
        return text
    return f"{text[:max_length]}..."


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
        "venom": "blight",
        "toxic": "blight",
        "blight": "blight",
        "fire": "fire",
        "ice": "ice",
        "frost": "ice",
        "thunder": "thunder",
        "lightning": "thunder",
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
            if not attr or attr in seen or attr not in ELEMENTS:
                continue
            seen.add(attr)
            normalized.append(attr)
    return normalized[:3]


def merge_attr_sets(*attr_sets: Iterable[str], max_attrs: int = 3) -> List[str]:
    counts: Dict[str, int] = {}
    first_seen: Dict[str, int] = {}
    cursor = 0

    for group in attr_sets:
        for attr in normalize_attr_set(group):
            counts[attr] = counts.get(attr, 0) + 1
            if attr not in first_seen:
                first_seen[attr] = cursor
                cursor += 1

    ranked = sorted(counts.keys(), key=lambda attr: (-counts[attr], first_seen[attr]))
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


def _is_mechanical_name(name: str, parent_names: List[str]) -> bool:
    if not name:
        return True

    bad_patterns = ["之阵", "融合", "合成", "+"]
    for pattern in bad_patterns:
        if pattern in name:
            return True

    for parent_name in parent_names:
        if not parent_name:
            continue
        if name == parent_name:
            return True
        if len(parent_name) >= 3 and parent_name in name:
            return True
    return False


def create_forge_task(
    *,
    spell_a: Optional[dict],
    spell_b: Optional[dict],
) -> str:
    task_id = f"task_{uuid.uuid4().hex[:12]}"

    with _lock:
        _tasks[task_id] = {"status": "pending", "result": None, "error": None}

    logger.info(
        "forge.task_created %s",
        _json_log(
            {
                "taskId": task_id,
                "slotA": _summarize_input(spell_a),
                "slotB": _summarize_input(spell_b),
            }
        ),
    )

    thread = threading.Thread(
        target=_process_forge,
        args=(task_id, spell_a, spell_b),
        daemon=True,
    )
    thread.start()
    return task_id


def get_task_status(task_id: str) -> Optional[dict]:
    with _lock:
        return _tasks.get(task_id)


def _process_forge(task_id: str, spell_a: Optional[dict], spell_b: Optional[dict]):
    try:
        inputs = [item for item in (spell_a, spell_b) if item]
        input_state = _resolve_input_state(spell_a, spell_b)
        logger.info(
            "forge.task_started %s",
            _json_log(
                {
                    "taskId": task_id,
                    "inputState": input_state,
                    "inputCount": len(inputs),
                }
            ),
        )

        if input_state == "empty":
            result = _build_opening_pool_result(task_id=task_id, input_state=input_state)
        else:
            result = _build_semantic_result(
                task_id=task_id,
                input_state=input_state,
                spell_a=spell_a,
                spell_b=spell_b,
                inputs=inputs,
            )

        with _lock:
            if task_id in _tasks:
                _tasks[task_id]["status"] = "completed"
                _tasks[task_id]["result"] = result

        logger.info(
            "forge.task_completed %s",
            _json_log(
                {
                    "taskId": task_id,
                    "name": result.name,
                    "attrSet": result.attrSet,
                    "source": result.source,
                    "inputState": result.inputState,
                    "promptRoute": result.promptRoute,
                    "promptRouteReason": result.promptRouteReason,
                    "promptFallbackApplied": result.promptFallbackApplied,
                    "promptTemplate": result.promptTemplate,
                    "promptModel": result.promptModel,
                }
            ),
        )
    except Exception as exc:
        with _lock:
            if task_id in _tasks:
                _tasks[task_id]["status"] = "failed"
                _tasks[task_id]["error"] = str(exc)
        logger.exception("forge.task_failed %s", _json_log({"taskId": task_id, "error": str(exc)}))


def _build_opening_pool_result(*, task_id: str, input_state: str) -> ForgeResult:
    seed = random.choice(DEFAULT_OPENING_POOL)
    attr_set = normalize_attr_set(seed["attrSet"])
    generation = int(seed.get("generation") or 1)
    main_attr = attr_set[0] if attr_set else None
    sub_attr = attr_set[1] if len(attr_set) > 1 else None
    theme_text = str(seed.get("themeText") or "").strip()
    prompt_meta = _generate_video_prompt(theme_text, task_id=task_id)

    return ForgeResult(
        name=seed["name"],
        attrSet=attr_set,
        themeText=theme_text,
        mainAttr=main_attr,
        subAttr=sub_attr,
        element=main_attr,
        generation=generation,
        baseAtk=calc_base_atk(generation),
        videoPrompt=prompt_meta["videoPrompt"],
        promptRoute=prompt_meta["promptRoute"],
        promptRouteReason=prompt_meta["promptRouteReason"],
        promptFallbackApplied=prompt_meta["promptFallbackApplied"],
        promptTemplate=prompt_meta["promptTemplate"],
        promptModel=prompt_meta["promptModel"],
        promptRouteElapsedMs=prompt_meta["promptRouteElapsedMs"],
        promptGenerationElapsedMs=prompt_meta["promptGenerationElapsedMs"],
        promptTotalElapsedMs=prompt_meta["promptTotalElapsedMs"],
        videoUrl=None,
        status="partial",
        source="opening_pool",
        inputState=input_state,
    )


def _build_semantic_result(
    *,
    task_id: str,
    input_state: str,
    spell_a: Optional[dict],
    spell_b: Optional[dict],
    inputs: List[dict],
) -> ForgeResult:
    use_real_llm = os.getenv("FORGE_USE_REAL_LLM", "false").lower() == "true"
    parent_names = [str(item.get("name") or "").strip() for item in inputs if item.get("name")]
    generation = max(int(item.get("generation") or 1) for item in inputs) + 1 if inputs else 1

    llm_result = None
    if use_real_llm:
        provider = os.getenv("LLM_PROVIDER", "gemini_rest")
        model = os.getenv("LLM_MODEL", "gemini-2.0-flash")
        print(f"[FORGE] LLM enabled - provider={provider}, model={model}, inputState={input_state}")
        llm_result = call_forge_semantic_llm(input_state=input_state, spell_a=spell_a, spell_b=spell_b)
        if llm_result:
            print(f"[FORGE] LLM SUCCESS - name={llm_result.get('name')}, attrSet={llm_result.get('attrSet')}")
        else:
            print("[FORGE] LLM FAILED - falling back to local semantic generation")
    else:
        print("[FORGE] FORGE_USE_REAL_LLM=false - using local semantic fallback")

    llm_attr_set = normalize_attr_set(*(llm_result.get("attrSet") or []) if llm_result else [])
    fallback_attr_set = _infer_attr_set_by_keywords(inputs)
    attr_set = llm_attr_set or fallback_attr_set
    if not attr_set:
        merged_existing_attrs = merge_attr_sets(*(item.get("attr_set") or [] for item in inputs))
        attr_set = merged_existing_attrs or [random.choice(ELEMENTS)]

    llm_name = str(llm_result.get("name") or "").strip() if llm_result else ""
    llm_theme_text = str(llm_result.get("themeText") or "").strip() if llm_result else ""

    if llm_name and _is_mechanical_name(llm_name, parent_names):
        print(f"[FORGE] Name warning: '{llm_name}' flagged as mechanical-style, fallback applied")
        llm_name = ""

    name = llm_name or _generate_fallback_name(attr_set)
    theme_text = llm_theme_text or _build_theme_text_fallback(name=name, attr_set=attr_set, inputs=inputs)
    prompt_meta = _generate_video_prompt(theme_text, task_id=task_id)

    main_attr = attr_set[0] if attr_set else None
    sub_attr = attr_set[1] if len(attr_set) > 1 else None
    source = "llm" if llm_result else "fallback"

    return ForgeResult(
        name=name,
        attrSet=attr_set,
        themeText=theme_text,
        mainAttr=main_attr,
        subAttr=sub_attr,
        element=main_attr,
        generation=generation,
        baseAtk=calc_base_atk(generation),
        videoPrompt=prompt_meta["videoPrompt"],
        promptRoute=prompt_meta["promptRoute"],
        promptRouteReason=prompt_meta["promptRouteReason"],
        promptFallbackApplied=prompt_meta["promptFallbackApplied"],
        promptTemplate=prompt_meta["promptTemplate"],
        promptModel=prompt_meta["promptModel"],
        promptRouteElapsedMs=prompt_meta["promptRouteElapsedMs"],
        promptGenerationElapsedMs=prompt_meta["promptGenerationElapsedMs"],
        promptTotalElapsedMs=prompt_meta["promptTotalElapsedMs"],
        videoUrl=None,
        status="partial",
        source=source,
        inputState=input_state,
    )


def _generate_video_prompt(theme_text: str, *, task_id: str) -> dict:
    started = time.perf_counter()
    cleaned_theme = str(theme_text or "").strip()
    if not cleaned_theme:
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        fallback_reason = "themeText empty: skipped glyph router"
        logger.warning(
            "forge.prompt_router_skipped %s",
            _json_log(
                {
                    "taskId": task_id,
                    "themeText": cleaned_theme,
                    "enteredLocalFallback": True,
                    "fallbackReason": fallback_reason,
                }
            ),
        )
        return {
            "videoPrompt": build_prompt_fallback(cleaned_theme),
            "promptRoute": "local_fallback",
            "promptRouteReason": fallback_reason,
            "promptFallbackApplied": True,
            "promptTemplate": None,
            "promptModel": None,
            "promptRouteElapsedMs": None,
            "promptGenerationElapsedMs": None,
            "promptTotalElapsedMs": elapsed_ms,
        }

    try:
        payload = run_prompt_router(cleaned_theme, task_id=task_id)
        prompt_meta = {
            "videoPrompt": payload.get("final_prompt"),
            "promptRoute": payload.get("route_selected"),
            "promptRouteReason": payload.get("route_reason"),
            "promptFallbackApplied": bool(payload.get("fallback_applied", False)),
            "promptTemplate": payload.get("final_template"),
            "promptModel": payload.get("model"),
            "promptRouteElapsedMs": payload.get("route_elapsed_ms"),
            "promptGenerationElapsedMs": payload.get("generation_elapsed_ms"),
            "promptTotalElapsedMs": payload.get("total_elapsed_ms"),
        }
        logger.info(
            "forge.prompt_router_result %s",
            _json_log(
                {
                    "taskId": task_id,
                    "themeText": _truncate_text(cleaned_theme),
                    "promptRoute": prompt_meta["promptRoute"],
                    "promptRouteReason": prompt_meta["promptRouteReason"],
                    "promptFallbackApplied": prompt_meta["promptFallbackApplied"],
                    "promptTemplate": prompt_meta["promptTemplate"],
                    "promptModel": prompt_meta["promptModel"],
                }
            ),
        )
        return prompt_meta
    except Exception as exc:
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        fallback_reason = str(exc).strip() or "glyph router unavailable"
        logger.warning(
            "forge.prompt_router_local_fallback %s",
            _json_log(
                {
                    "taskId": task_id,
                    "themeText": _truncate_text(cleaned_theme),
                    "enteredLocalFallback": True,
                    "fallbackReason": fallback_reason,
                    "elapsedMs": elapsed_ms,
                }
            ),
        )
        return {
            "videoPrompt": build_prompt_fallback(cleaned_theme),
            "promptRoute": "local_fallback",
            "promptRouteReason": fallback_reason,
            "promptFallbackApplied": True,
            "promptTemplate": None,
            "promptModel": None,
            "promptRouteElapsedMs": None,
            "promptGenerationElapsedMs": None,
            "promptTotalElapsedMs": elapsed_ms,
        }


def _infer_attr_set_by_keywords(inputs: List[dict]) -> List[str]:
    text = " ".join(
        filter(
            None,
            (
                str(item.get("name") or "").lower()
                + " "
                + str(item.get("theme_text") or "").lower()
                for item in inputs
            ),
        )
    )
    if not text:
        return []

    first_seen = {}
    scores = {}
    for attr, keywords in ATTR_KEYWORDS.items():
        score = 0
        for keyword in keywords:
            index = text.find(keyword.lower())
            if index == -1:
                continue
            score += 1
            first_seen[attr] = min(first_seen.get(attr, index), index)
        if score > 0:
            scores[attr] = score

    ranked = sorted(scores.keys(), key=lambda attr: (-scores[attr], first_seen.get(attr, 10**9)))
    return ranked[:3]


def _build_theme_text_fallback(*, name: str, attr_set: List[str], inputs: List[dict]) -> str:
    attr_text = "、".join(ELEMENT_LABELS.get(attr, attr) for attr in attr_set) or "混沌"
    input_names = "、".join(str(item.get("name") or "").strip() for item in inputs if item.get("name"))
    if input_names:
        return (
            f"{name}围绕{input_names}的意象重构为一枚{attr_text}主题的炼金法阵，"
            "俯视视角下边界清晰，中心主体凝聚，能量在范围内受控流动并完成一次明确释放。"
        )
    return (
        f"{name}是一枚{attr_text}主题的炼金法阵，俯视视角下边界清晰，"
        "中央能量核稳定脉动，主体、材质与辉光都被严格收束在技能范围内。"
    )


def _resolve_input_state(spell_a: Optional[dict], spell_b: Optional[dict]) -> str:
    if spell_a and spell_b:
        return "dual"
    if spell_a or spell_b:
        return "single"
    return "empty"


def _summarize_input(spell: Optional[dict]) -> str:
    if not spell:
        return "empty"
    return (
        f"type={spell.get('type') or 'spell'}, "
        f"name={spell.get('name') or '-'}, "
        f"attrs={normalize_attr_set(spell.get('attr_set') or [])}, "
        f"gen={spell.get('generation') or 1}"
    )
