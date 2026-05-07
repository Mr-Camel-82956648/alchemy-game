from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

from alchemy_glyph_router_api import run_alchemy_glyph_router
from config import Settings
from generator import generate_prompt, load_full_template
from router import route_theme


class StubLLMClient:
    def __init__(self, responses: list[str]) -> None:
        self.responses = responses
        self.calls: list[list[dict[str, str]]] = []

    def chat(self, messages: list[dict[str, str]], temperature: float = 0.2) -> str:
        self.calls.append(messages)
        if not self.responses:
            raise RuntimeError("no_stub_response")
        return self.responses.pop(0)


def main() -> None:
    root_dir = Path(__file__).resolve().parent
    b1_client = StubLLMClient(
        [
            (
                '{"selected_template":"B1","route_reason":"主题核心是中央唯一主裁决体垂直降临命中",'
                '"fallback_needed":false,"fallback_target":null}'
            ),
            (
                "纯黑画面中央先亮起一点冷白金色锋芒，下一瞬间一大片半透明、肃穆、神圣的受击领域贴地展开，"
                "上方有一把高亮而锐利的圣剑主光体从高处垂直降下，准确命中中央区域，"
                "命中瞬间只在边界内激起一次短促而集中的锋芒闪爆与细密冲击波纹，随后迅速失光并向内收束。"
            ),
        ]
    )

    b1_route = route_theme("圣剑坠落", root_dir / "templates" / "cards", b1_client)
    assert b1_route.selected_template == "B1"
    assert b1_route.fallback_needed is False
    assert b1_route.fallback_target is None

    b1_template_markdown = load_full_template(root_dir / "templates" / "full", "B1_fallback_full")
    b1_final_prompt = generate_prompt("圣剑坠落", b1_template_markdown, b1_client)

    assert "圣剑" in b1_final_prompt
    assert len(b1_client.calls) == 2

    d_client = StubLLMClient(
        [
            (
                '{"selected_template":"D","route_reason":"主题核心是灵体沿边界内路径轻盈穿行留痕",'
                '"fallback_needed":false,"fallback_target":null}'
            ),
            (
                "纯黑画面中央先亮起一点幽蓝白色微光，下一瞬间一片半透明、宁静、深流感极强的灵域贴地展开，"
                "其上有一道轮廓清晰但尺度受控的鲸影灵体沿着边界内部缓慢游弋、轻微回旋与短暂掠过，"
                "运动过程中留下柔和的蓝白流痕、少量水纹波痕与短暂残影，随后同步迅速失光并向内收束。"
            ),
        ]
    )

    d_route = route_theme("鲸影游弋", root_dir / "templates" / "cards", d_client)
    assert d_route.selected_template == "D"
    assert d_route.fallback_needed is False
    assert d_route.fallback_target is None

    d_template_markdown = load_full_template(root_dir / "templates" / "full", "D_trail_full")
    d_final_prompt = generate_prompt("鲸影游弋", d_template_markdown, d_client)

    assert "鲸影" in d_final_prompt
    assert len(d_client.calls) == 2

    c_client = StubLLMClient(
        [
            (
                '{"selected_template":"C","route_reason":"主题核心是地面内部向上破土生成事件",'
                '"fallback_needed":false,"fallback_target":null}'
            ),
            (
                "纯黑画面中央先亮起一点温润的青木金绿色微光，下一瞬间一片半透明、富有生长感的地涌领域贴地展开，"
                "中央区域随即出现局部隆起与裂开，一株轮廓清晰、尺度受控的树形主体从地面内部迅速破土而出，"
                "伴随少量碎土、根须顶开地表与柔和生机流光，随后同步迅速失光并向内收束。"
            ),
        ]
    )

    c_route = route_theme("树木破土而出", root_dir / "templates" / "cards", c_client)
    assert c_route.selected_template == "C"
    assert c_route.fallback_needed is False
    assert c_route.fallback_target is None

    c_template_markdown = load_full_template(root_dir / "templates" / "full", "C_eruption_full")
    c_final_prompt = generate_prompt("树木破土而出", c_template_markdown, c_client)

    assert "破土" in c_final_prompt
    assert len(c_client.calls) == 2

    e_client = StubLLMClient(
        [
            (
                '{"selected_template":"E","route_reason":"主题核心是边界内瞬时震爆与脉冲释放事件",'
                '"fallback_needed":false,"fallback_target":null}'
            ),
            (
                "纯黑画面中央先亮起一点高纯度金白色圣辉微光，下一瞬间一片半透明、庄严、克制的爆发领域贴地展开，"
                "中央区域迅速凝聚出一个耀眼而受控的圣光爆发核，下一瞬间发生一次短促、强烈、纯净的圣光震爆，"
                "激起受控的金白脉冲环、少量碎光片与柔和裂闪，随后同步迅速失光并向内收束。"
            ),
        ]
    )

    e_route = route_theme("圣光震爆", root_dir / "templates" / "cards", e_client)
    assert e_route.selected_template == "E"
    assert e_route.fallback_needed is False
    assert e_route.fallback_target is None

    e_template_markdown = load_full_template(root_dir / "templates" / "full", "E_burst_full")
    e_final_prompt = generate_prompt("圣光震爆", e_template_markdown, e_client)

    assert "震爆" in e_final_prompt
    assert len(e_client.calls) == 2

    f_client = StubLLMClient(
        [
            (
                '{"selected_template":"F","route_reason":"主题核心是单体主体在边界内显现并短暂停驻",'
                '"fallback_needed":false,"fallback_target":null}'
            ),
            (
                "纯黑画面中央先亮起一点暗金与幽蓝交织的微光，下一瞬间一片贴附地面的古老召现领域安静展开，"
                "中央区域随即出现密集而克制的暗金碎光与几何投影拼片，一个小型、轮廓明确、体量受控的金字塔状主体逐步凝聚成形，"
                "形成后短暂停驻在边界中央，伴随少量贴近主体的流辉与残片缓慢起伏，随后同步迅速失光并向内收束。"
            ),
        ]
    )

    f_route = route_theme("金字塔显现", root_dir / "templates" / "cards", f_client)
    assert f_route.selected_template == "F"
    assert f_route.fallback_needed is False
    assert f_route.fallback_target is None

    f_template_markdown = load_full_template(root_dir / "templates" / "full", "F_manifest_full")
    f_final_prompt = generate_prompt("金字塔显现", f_template_markdown, f_client)

    assert "金字塔" in f_final_prompt
    assert len(f_client.calls) == 2

    api_client = StubLLMClient(
        [
            (
                '{"selected_template":"C","route_reason":"主题核心是地面内部向上破土生成事件",'
                '"fallback_needed":false,"fallback_target":null}'
            ),
            (
                "纯黑画面中央先亮起一点温润的青木金绿色微光，下一瞬间一片半透明、富有生长感的地涌领域贴地展开，"
                "中央区域随即出现局部隆起与裂开，一株轮廓清晰、尺度受控的树形主体从地面内部迅速破土而出，"
                "伴随少量碎土、根须顶开地表与柔和生机流光，随后同步迅速失光并向内收束。"
            ),
        ]
    )
    api_settings = Settings(
        base_url="https://example.invalid",
        api_key="test-key",
        model="gpt-5.4",
        timeout_seconds=60.0,
        log_level="INFO",
        root_dir=root_dir,
        outputs_dir=root_dir / "outputs",
        logs_dir=root_dir / "logs",
        cards_dir=root_dir / "templates" / "cards",
        full_templates_dir=root_dir / "templates" / "full",
    )

    with patch("alchemy_glyph_router_api.load_settings", return_value=api_settings), patch(
        "alchemy_glyph_router_api.LLMClient", return_value=api_client
    ):
        api_result = run_alchemy_glyph_router("树木破土而出")

    assert api_result["route_selected"] == "C"
    assert api_result["final_template"] == "C_eruption_full"
    assert "破土" in api_result["final_prompt"]
    assert api_result["model"] == "gpt-5.4"
    assert len(api_client.calls) == 2
    print("smoke_test_passed")


if __name__ == "__main__":
    main()
