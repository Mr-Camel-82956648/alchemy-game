import os
import json
import logging
import httpx

logger = logging.getLogger("forge.llm")

VALID_ELEMENTS = {"fire", "ice", "thunder", "blight"}
ELEMENT_ALIASES = {
    "fire": "fire",
    "flame": "fire",
    "blaze": "fire",
    "inferno": "fire",
    "ember": "fire",
    "火": "fire",
    "炎": "fire",
    "焰": "fire",
    "烈焰": "fire",
    "ice": "ice",
    "frost": "ice",
    "snow": "ice",
    "cold": "ice",
    "冰": "ice",
    "霜": "ice",
    "寒": "ice",
    "寒冰": "ice",
    "冰霜": "ice",
    "thunder": "thunder",
    "lightning": "thunder",
    "electric": "thunder",
    "electricity": "thunder",
    "雷": "thunder",
    "电": "thunder",
    "雷电": "thunder",
    "blight": "blight",
    "poison": "blight",
    "toxic": "blight",
    "venom": "blight",
    "decay": "blight",
    "腐蚀": "blight",
    "侵蚀": "blight",
    "枯萎": "blight",
    "瘴": "blight",
    "瘴毒": "blight",
    "毒": "blight",
    "蚀": "blight",
}

SYSTEM_PROMPT = """你是"AI法阵·炼金术士"的法阵融合引擎。基于两个父法阵，生成一个全新的融合法阵。

设计原则：
- 视觉优先：法阵的核心是视觉表现，不是数值
- 规则极简：不要发明复杂世界观或冗长设定
- 数值为视觉服务
- 输出适合 2.5D 俯视角游戏法阵特效的概念基础
- 主属性基于视觉主导特征判断
- 融合应体现两个父法阵特征的有机结合
- 输出简洁、清晰、稳定、可解析

命名规则（非常重要）：
- 优先 4 个汉字，最多 6 个汉字
- 必须是融合后的全新名称，体现新意象
- 禁止直接使用、拼接或保留任何父法阵的原始名称
- 禁止使用"之阵""融合""合成""与""·"等机械连接形式
- 名称应尽量保留两个输入的核心视觉意象，不要退化成空泛的元素词堆砌
- 即使输入是食物、建筑、地名、俗语或普通名词，也要提取其可视化意象（形体、材质、色彩、运动、氛围）再融合成法阵名
- 尽量避免过于泛化、像占位词一样的名字，例如：惊雷炎轮、寒冰电印、瘴毒火环、烈焰雷阵
- 好名字示例：霜龙吐息、雷火焚天、冰雷裂空、蚀焰漩涡、凝霜怒雷
- 坏名字示例（绝对禁止）：A·B之阵、A与B、AB融合阵

元素只能从以下四个中选择：fire, ice, thunder, blight
subAttr 必须与 mainAttr 不同。
JSON 中 `mainAttr` 与 `subAttr` 必须使用上述四个英文小写值之一，不要输出中文元素名，不要输出其他近义词。

严格按以下 JSON 格式输出，不要附带任何其他文字：
{
  "name": "新法阵名称（4个汉字优先，最多6个）",
  "mainAttr": "fire 或 ice 或 thunder 或 blight",
  "subAttr": "fire 或 ice 或 thunder 或 blight（必须与 mainAttr 不同）",
  "visualDesc": "法阵视觉描述（1-2句，描述俯视角下看到的法阵特效）",
  "fusionPrompt": "给视频生成模型的英文提示词（1-2句，描述法阵视觉效果）"
}"""


def _build_user_prompt(spell_a_name, spell_a_attr, spell_a_gen,
                       spell_b_name, spell_b_attr, spell_b_gen):
    return f"""请融合以下两个父法阵，生成一个全新的融合法阵：

父法阵 A：
- 名称：{spell_a_name}
- 主属性：{spell_a_attr or '未知'}
- 世代：{spell_a_gen}

父法阵 B：
- 名称：{spell_b_name}
- 主属性：{spell_b_attr or '未知'}
- 世代：{spell_b_gen}

请先在心中提取两个输入各自最鲜明的视觉意象，再进行融合：
- 形体或主体（例如龙、楼阁、器物、飞鸟、烟雾、浪潮）
- 材质与颜色（例如寒霜、铜火、椒红、金影、夜雾）
- 运动与气势（例如盘旋、坠落、喷吐、升腾、俯冲、扩散）

重要命名要求：
- 新法阵名称必须是全新创造的（4个汉字优先），禁止直接拼接"{spell_a_name}"和"{spell_b_name}"
- 名称要尽量让人隐约感到两个输入都参与了融合，而不是只剩泛元素标签
- 如果输入来自食物、建筑、地名、俗语或普通名词，也必须把它们转译成法阵意象，不要偷懒退化为通用元素词名
- 避免输出像“惊雷炎轮”“寒冰电印”“瘴毒火环”这种泛元素占位感过强的名字

输出要求：
- `mainAttr` 和 `subAttr` 必须是：fire / ice / thunder / blight 之一
- `mainAttr` 与 `subAttr` 必须不同

请输出融合后的新法阵（严格 JSON 格式）。"""


def _normalize_element(value):
    if value is None:
        return None

    text = str(value).strip()
    if not text:
        return None

    compact = text.replace(" ", "").replace("_", "").replace("-", "").lower()
    if compact.endswith("属性"):
        compact = compact[:-2]

    return ELEMENT_ALIASES.get(compact, compact)


def _extract_json_text(text):
    text = str(text or "").strip()
    if not text:
        raise json.JSONDecodeError("empty response", text, 0)

    if text.startswith("```"):
        lines = text.splitlines()
        if lines:
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        return text[start:end + 1]

    return text


def _extract_openai_message_text(message):
    if isinstance(message, str):
        return message

    if isinstance(message, list):
        parts = []
        for item in message:
            if isinstance(item, dict) and item.get("type") == "text":
                parts.append(str(item.get("text", "")))
            elif isinstance(item, str):
                parts.append(item)
        return "\n".join(parts).strip()

    return str(message or "").strip()


def _validate(raw):
    """校验并规范化 LLM 返回的 JSON，返回 dict 或 None。"""
    if not isinstance(raw, dict):
        return None

    name = raw.get("name")
    main_attr = raw.get("mainAttr") or raw.get("element")
    sub_attr = raw.get("subAttr")
    visual_desc = raw.get("visualDesc", "")
    fusion_prompt = raw.get("fusionPrompt", "")

    if not name or not main_attr:
        print(f"  [LLM] VALIDATE FAIL: missing name={name} or mainAttr={main_attr}")
        return None

    main_attr = _normalize_element(main_attr)
    if sub_attr:
        sub_attr = _normalize_element(sub_attr)

    if main_attr not in VALID_ELEMENTS:
        print(f"  [LLM] VALIDATE FAIL: invalid mainAttr={main_attr}")
        return None
    if sub_attr and sub_attr not in VALID_ELEMENTS:
        sub_attr = None
    if sub_attr == main_attr:
        sub_attr = None

    name = str(name).strip()
    if len(name) > 20:
        name = name[:20]

    return {
        "name": name,
        "mainAttr": main_attr,
        "subAttr": sub_attr,
        "visualDesc": str(visual_desc).strip()[:200] if visual_desc else "",
        "fusionPrompt": str(fusion_prompt).strip()[:300] if fusion_prompt else "",
    }


def _log_location_restriction(provider_name, error_text):
    text = str(error_text or "")
    lowered = text.lower()
    if "user location is not supported for the api use" in lowered or "location is not supported" in lowered:
        print(f"  [LLM] {provider_name} availability issue: request appears blocked by network/region restrictions")


def _call_gemini_rest(user_prompt, timeout, max_retries):
    api_key = os.getenv("GEMINI_API_KEY", "")
    model = os.getenv("LLM_MODEL", "gemini-2.0-flash")

    if not api_key:
        print("  [LLM] Gemini skipped: GEMINI_API_KEY not set")
        return None

    url = (
        f"https://generativelanguage.googleapis.com"
        f"/v1beta/models/{model}:generateContent?key={api_key}"
    )

    payload = {
        "systemInstruction": {
            "parts": [{"text": SYSTEM_PROMPT}]
        },
        "contents": [{
            "role": "user",
            "parts": [{"text": user_prompt}]
        }],
        "generationConfig": {
            "temperature": 0.85,
            "responseMimeType": "application/json",
        },
    }

    total_attempts = 1 + max_retries
    for attempt in range(total_attempts):
        try:
            print(f"  [LLM] Gemini request attempt {attempt + 1}/{total_attempts}  model={model}")
            resp = httpx.post(url, json=payload, timeout=timeout)
            resp.raise_for_status()

            body = resp.json()
            text = body["candidates"][0]["content"]["parts"][0]["text"]
            print(f"  [LLM] Gemini raw response: {text[:300]}")

            raw = json.loads(_extract_json_text(text))
            validated = _validate(raw)
            if validated:
                print(f"  [LLM] Gemini validation OK: name={validated['name']}, mainAttr={validated['mainAttr']}")
                return validated

            print("  [LLM] Gemini validation FAILED for parsed JSON")

        except httpx.HTTPStatusError as e:
            error_text = e.response.text[:200]
            print(f"  [LLM] Gemini HTTP error (attempt {attempt + 1}): {e.response.status_code} — {error_text}")
            _log_location_restriction("Gemini", error_text)
        except (json.JSONDecodeError, KeyError, IndexError) as e:
            print(f"  [LLM] Gemini parse error (attempt {attempt + 1}): {e}")
        except Exception as e:
            print(f"  [LLM] Gemini call error (attempt {attempt + 1}): {e}")

    return None


def _call_openai_compat(user_prompt, timeout, max_retries):
    base_url = os.getenv("LLM_BASE_URL", "").rstrip("/")
    api_key = os.getenv("LLM_API_KEY", "")
    model = os.getenv("OPENAI_COMPAT_MODEL", "")

    if not base_url or not api_key or not model:
        print("  [LLM] OpenAI-compatible backup skipped: missing LLM_BASE_URL / LLM_API_KEY / OPENAI_COMPAT_MODEL")
        return None

    url = f"{base_url}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.85,
    }

    total_attempts = 1 + max_retries
    for attempt in range(total_attempts):
        try:
            print(f"  [LLM] OpenAI-compatible request attempt {attempt + 1}/{total_attempts}  model={model}")
            resp = httpx.post(url, headers=headers, json=payload, timeout=timeout)
            resp.raise_for_status()

            body = resp.json()
            message = body["choices"][0]["message"]["content"]
            text = _extract_openai_message_text(message)
            print(f"  [LLM] OpenAI-compatible raw response: {text[:300]}")

            raw = json.loads(_extract_json_text(text))
            validated = _validate(raw)
            if validated:
                print(f"  [LLM] OpenAI-compatible validation OK: name={validated['name']}, mainAttr={validated['mainAttr']}")
                return validated

            print("  [LLM] OpenAI-compatible validation FAILED for parsed JSON")

        except httpx.HTTPStatusError as e:
            error_text = e.response.text[:200]
            print(f"  [LLM] OpenAI-compatible HTTP error (attempt {attempt + 1}): {e.response.status_code} — {error_text}")
            _log_location_restriction("OpenAI-compatible", error_text)
        except (json.JSONDecodeError, KeyError, IndexError) as e:
            print(f"  [LLM] OpenAI-compatible parse error (attempt {attempt + 1}): {e}")
        except Exception as e:
            print(f"  [LLM] OpenAI-compatible call error (attempt {attempt + 1}): {e}")

    return None


def call_gemini_rest(spell_a_name, spell_a_attr, spell_a_gen,
                     spell_b_name, spell_b_attr, spell_b_gen):
    """按主 provider 优先、OpenAI-compatible 备援的策略生成融合法阵。"""
    timeout = int(os.getenv("LLM_TIMEOUT_SECONDS", "30"))
    max_retries = int(os.getenv("LLM_MAX_RETRIES", "1"))
    primary_provider = os.getenv("LLM_PROVIDER", "gemini_rest").strip().lower() or "gemini_rest"

    user_prompt = _build_user_prompt(
        spell_a_name, spell_a_attr, spell_a_gen,
        spell_b_name, spell_b_attr, spell_b_gen,
    )

    print(f"  [LLM] Primary provider selected: {primary_provider}")

    if primary_provider == "openai_compat":
        result = _call_openai_compat(user_prompt, timeout, max_retries)
        if result:
            print("  [LLM] Primary provider success: openai_compat")
        else:
            print("  [LLM] Primary provider failed: openai_compat")
        return result

    if primary_provider != "gemini_rest":
        print(f"  [LLM] Unknown primary provider '{primary_provider}', falling back to gemini_rest as primary")

    result = _call_gemini_rest(user_prompt, timeout, max_retries)
    if result:
        print("  [LLM] Primary provider success: gemini_rest")
        return result

    print("  [LLM] Primary provider failed: gemini_rest")
    print("  [LLM] Switching to backup provider: openai_compat")

    backup_result = _call_openai_compat(user_prompt, timeout, max_retries)
    if backup_result:
        print("  [LLM] Backup provider success: openai_compat")
        return backup_result

    print("  [LLM] Backup provider failed: openai_compat")

    return None
