from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from llm_client import LLMClient

FORMAL_TEMPLATE_CODES = ("A", "B1", "B2", "C", "D", "E", "F")
ALLOWED_TEMPLATE_CODES = set(FORMAL_TEMPLATE_CODES)


@dataclass(frozen=True)
class RouteDecision:
    selected_template: str
    route_reason: str
    fallback_needed: bool
    fallback_target: str | None


def load_cards(cards_dir: Path) -> list[dict[str, str]]:
    cards = []
    for path in sorted(cards_dir.glob("*.md")):
        code = path.stem.split("_", 1)[0].upper()
        if code not in ALLOWED_TEMPLATE_CODES:
            continue
        cards.append(
            {
                "code": code,
                "name": path.stem,
                "content": path.read_text(encoding="utf-8").strip(),
            }
        )
    if not cards:
        raise FileNotFoundError("no_template_cards")
    return cards


def route_theme(theme: str, cards_dir: Path, llm_client: LLMClient) -> RouteDecision:
    cards = load_cards(cards_dir)
    card_block = "\n\n".join(
        f"卡片代号：{card['code']}\n卡片文件：{card['name']}\n{card['content']}" for card in cards
    )

    messages = [
        {
            "role": "system",
            "content": (
                "你是模板路由器。请只根据主题与卡片内容选择最合适的模板代号。"
                "优先根据主题所暗示的运动语法、事件结构和空间组织方式进行判断，而不是根据字面题材联想。"
                "你必须只返回一个 JSON 对象，不要使用代码块，不要输出额外说明。"
            ),
        },
        {
            "role": "user",
            "content": (
                f"主题：{theme}\n\n"
                "可选模板代号只有：A、B1、B2、C、D、E、F。\n"
                "其中 C 用于被边界承载的自地而上的生成、破土、裂出、喷涌、突生、蔓生事件，"
                "尤其关注破土、长出、升起、穿破、裂开、裂出、喷出、冒出、突刺、隆起、蔓生、"
                "爆长、喷涌、地脉、地火、岩浆、冰刺、冰川穿破地面、晶簇、荆棘、树木破土、树根、"
                "石柱升起、骸骨冒出等语义。\n"
                "其中 D 用于被边界承载的轨迹穿行事件，尤其关注飞过、掠过、穿行、绕行、绕境、回旋、盘旋、"
                "游弋、巡游、回绕、盘界，以及灵蝶、蝴蝶、纸鹤、鲸影、龙影、羽流、光鸟、星鱼、"
                "灵体悬浮或被领域托起的单体异象等语义。\n"
                "其中 E 用于被边界承载的瞬时能量爆发、震爆、脉冲释放、坍缩后爆开事件，"
                "尤其关注爆发、爆裂、炸开、震爆、脉冲、冲击、绽放、震荡、爆鸣、爆破、爆环、"
                "坍缩爆发、坍缩后释放、灵能震荡、奥术爆破、圣光震爆、火焰爆环、冰霜脉冲、"
                "虚空坍缩爆发、暗蚀爆鸣、星爆等语义。\n"
                "其中 F 用于被边界承载的单体主体显现并短暂停驻事件，"
                "尤其关注显现、显形、现身、召出、召现、显化、浮现、凝聚成形、落位、驻场、"
                "降临并驻留、召唤守护灵、守护灵现身、神像浮现、法相降临、金字塔显现、祭坛显形、"
                "石碑驻场、门扉显形、封印物显现、守护兽显形、圣像驻场等语义。\n"
                "返回 JSON 字段必须包含：selected_template、route_reason、fallback_needed、fallback_target。\n"
                "其中 selected_template 只能是 A/B1/B2/C/D/E/F；fallback_needed 只能是 true/false；"
                "如果不需要 fallback，fallback_target 写 null。\n"
                "route_reason 必须只输出一句简短中文说明，长度控制在 20 到 50 字。\n\n"
                f"{card_block}"
            ),
        },
    ]
    raw_text = llm_client.chat(messages, temperature=0)
    data = _parse_json_object(raw_text)

    selected_template = str(data.get("selected_template", "")).strip().upper()
    if selected_template not in ALLOWED_TEMPLATE_CODES:
        raise ValueError(f"invalid_selected_template={selected_template}")

    fallback_target_raw = data.get("fallback_target")
    fallback_target = None
    if fallback_target_raw not in (None, "", "null"):
        fallback_target = str(fallback_target_raw).strip().upper()
        if fallback_target not in ALLOWED_TEMPLATE_CODES:
            fallback_target = None

    return RouteDecision(
        selected_template=selected_template,
        route_reason=str(data.get("route_reason", "")).strip(),
        fallback_needed=_to_bool(data.get("fallback_needed", False)),
        fallback_target=fallback_target,
    )


def _parse_json_object(raw_text: str) -> dict:
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        lines = [line for line in cleaned.splitlines() if not line.strip().startswith("```")]
        cleaned = "\n".join(lines).strip()

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise ValueError("route_response_not_json")

    return json.loads(cleaned[start : end + 1])


def _to_bool(value: object) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() == "true"
    return bool(value)
