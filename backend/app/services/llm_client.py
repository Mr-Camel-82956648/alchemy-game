import os
import json
import logging
import httpx

logger = logging.getLogger("forge.llm")

VALID_ELEMENTS = {"fire", "ice", "thunder", "blight"}
ELEMENT_ALIASES = {"poison": "blight"}

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
- 好名字示例：霜龙吐息、雷火焚天、冰雷裂空、蚀焰漩涡、凝霜怒雷
- 坏名字示例（绝对禁止）：A·B之阵、A与B、AB融合阵

元素只能从以下四个中选择：fire, ice, thunder, blight
subAttr 必须与 mainAttr 不同。

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

重要：新法阵名称必须是全新创造的（4个汉字优先），禁止拼接"{spell_a_name}"和"{spell_b_name}"。
请输出融合后的新法阵（严格 JSON 格式）。"""


def _validate(raw):
    """校验并规范化 LLM 返回的 JSON，返回 dict 或 None。"""
    if not isinstance(raw, dict):
        return None

    name = raw.get("name")
    main_attr = raw.get("mainAttr")
    sub_attr = raw.get("subAttr")
    visual_desc = raw.get("visualDesc", "")
    fusion_prompt = raw.get("fusionPrompt", "")

    if not name or not main_attr:
        print(f"  [LLM] VALIDATE FAIL: missing name={name} or mainAttr={main_attr}")
        return None

    main_attr = ELEMENT_ALIASES.get(main_attr, main_attr)
    if sub_attr:
        sub_attr = ELEMENT_ALIASES.get(sub_attr, sub_attr)

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


def call_gemini_rest(spell_a_name, spell_a_attr, spell_a_gen,
                     spell_b_name, spell_b_attr, spell_b_gen):
    """调用 Gemini REST API 生成融合法阵，返回校验后的 dict 或 None。"""
    api_key = os.getenv("GEMINI_API_KEY", "")
    model = os.getenv("LLM_MODEL", "gemini-2.0-flash")
    timeout = int(os.getenv("LLM_TIMEOUT_SECONDS", "30"))
    max_retries = int(os.getenv("LLM_MAX_RETRIES", "1"))

    if not api_key:
        print("  [LLM] SKIP: GEMINI_API_KEY not set")
        return None

    url = (
        f"https://generativelanguage.googleapis.com"
        f"/v1beta/models/{model}:generateContent?key={api_key}"
    )

    user_prompt = _build_user_prompt(
        spell_a_name, spell_a_attr, spell_a_gen,
        spell_b_name, spell_b_attr, spell_b_gen,
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

            raw = json.loads(text)
            validated = _validate(raw)
            if validated:
                print(f"  [LLM] Validation OK: name={validated['name']}, mainAttr={validated['mainAttr']}")
                return validated

            print("  [LLM] Validation FAILED for parsed JSON")

        except httpx.HTTPStatusError as e:
            print(f"  [LLM] HTTP error (attempt {attempt + 1}): {e.response.status_code} — {e.response.text[:200]}")
        except (json.JSONDecodeError, KeyError, IndexError) as e:
            print(f"  [LLM] Parse error (attempt {attempt + 1}): {e}")
        except Exception as e:
            print(f"  [LLM] Call error (attempt {attempt + 1}): {e}")

    return None
