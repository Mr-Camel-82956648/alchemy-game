# alchemy-glyph-router

一个面向“暗黑炼金风 2.5D 技能特效提示词生成”的轻量模板路由系统。当前版本坚持最多两次 LLM 调用：第一次做模板路由，第二次基于完整模板生成成品中文提示词；同时保留简洁日志、模板文件、环境变量配置和本地 smoke test，方便作为本地 CLI 工具使用，也适合作为 Python 模块嵌入其他 backend 项目。

## 当前目标

- 维持轻量、可调试、工程化的模板路由流程。
- 当前主流程固定为两段：`route_theme` 一次，`generate_prompt` 一次。
- 优先巩固 A-F 主模板树的稳定性，不继续轻易扩类。

## 当前正式模板树

- `A`｜内聚型容器领域：主题核心是一个贴地展开的完整区域本体，重点是边界、内部能量面和整体气质成立，而不是强事件打击。
- `B1`｜单体降临裁决型：一个中央唯一主打击体从高处垂直降临，在区域内完成一次明确主命中或镇压。
- `B2`｜连续覆盖打击型：多个打击体在同一受击域内从上到下连续覆盖，重点是时间连续的洗地区域打击。
- `C`｜地涌生成型：结构或能量从地面内部向上生成、破土、裂出、喷涌，重点是自下而上的生成事件。
- `D`｜轨迹穿行型：某种意象在边界内沿路径穿行、回旋、掠过并留痕，重点是轨迹事件而不是区域本体。
- `E`｜爆发脉冲型：边界内部发生一次短促而受控的爆发、震爆、脉冲释放，重点是瞬时释放事件。
- `F`｜召现驻场型：一个单体主体在边界内部显现、落位并短暂停驻，重点是单体召现与存在感。

正式主流程当前对应的模板文件为：
- `templates/cards/A_container.md` 到 `templates/cards/F_manifest.md`
- `templates/full/A_container_full.md` 到 `templates/full/F_manifest_full.md`

## 当前不纳入正式能力的内容

- `G`｜群体构筑型：已做过探索，但当前稳定性不足，暂不纳入正式模板树。
- 若文件仍保留：`templates/cards/G_construct.md` 与 `templates/full/G_construct_full.md` 仅作为实验性遗留参考，不参与当前正式路由、正式映射或正式 smoke test 口径。

## 当前项目状态

- A-F 主模板树已完成阶段性收束，并经过多轮联调。
- 当前系统可以稳定处理一批常见技能主题的路由与生成。
- 后续优化更适合继续做子题材补丁、路由词补充、边界收束和模板细修，而不是继续扩展新的主类别。

## 对外稳定入口

当前项目支持两种对外使用方式，它们共享同一套结果结构：

- CLI：适合手工调试、联调、排查和独立运行。
- Python API：适合嵌入其他 backend 项目直接调用。

当前对外稳定承诺的是：

- CLI 输入语义：`python app.py --theme "..."`
- Python API 入口：`run_alchemy_glyph_router`
- 返回结果字典 / `outputs/*.json` 的字段结构

不建议外部项目依赖未声明稳定的内部实现细节，例如内部模块拆分方式、私有辅助函数或模板加载顺序等。

## 输入与输出

### 最小输入

当前系统的最小输入就是一个主题字符串：`theme`。

例如：

```text
冰凌火山
```

### 核心输出

- 系统最终核心业务输出是 `final_prompt`。
- `final_prompt` 是一条可直接交给视频模型使用的完整中文提示词。
- 除了 `final_prompt`，系统还会返回一批辅助字段，用于路由诊断、耗时记录、模板追踪和联调排查。

### 输出位置

- 如果使用 CLI，默认会写入 `outputs/`，每次运行生成一份 JSON 结果文件。
- 如果使用 Python API，默认返回结果字典，不强制落盘；当 `save_output=True` 时，行为与 CLI 一致。
- 控制台输出与 JSON / 返回字典是同构结果的两种呈现方式：前者适合人工调试，后者适合系统消费。

## 运行阶段与中间结构

当前主流程有两个稳定阶段：

### 1. 路由阶段（route）

- 根据主题判断应使用哪一类正式模板（A-F）。
- 当前这一阶段对应的关键字段包括：`route_selected`、`route_reason`、`fallback_applied`。
- 这些字段既是当前模块的必要调试结构，也是嵌入其他项目时很有价值的追踪信息。

### 2. 生成阶段（generate）

- 根据最终使用的 full template 生成完整成品提示词。
- 当前这一阶段对应的关键字段包括：`final_template`、`final_prompt`。

补充说明：

- `route_selected` 表示路由阶段原始选中的模板代号。
- `final_template` 表示最终实际用于生成的 full template 名称。
- 当存在 fallback 时，两者可能不同，因此不应假设它们永远一一对应。

### 当前阶段结构约束

- 当前项目默认最多两次 LLM 调用：一次路由、一次生成。
- 现阶段最稳定的中间决策字段，就是 `route_selected`、`route_reason`、`fallback_applied`、`final_template`。
- 如果上层系统需要做路由质量追踪、模板归因、耗时监控，这些字段就是当前最值得保留的结构化中间信息。

## 安装

```bash
pip install -r requirements.txt
```

## 环境变量

在项目根目录放置 `.env`，至少配置以下变量：

```env
LLM_BASE_URL=
LLM_API_KEY=
OPENAI_COMPAT_MODEL=
LLM_TIMEOUT_SECONDS=
LOG_LEVEL=
```

## 使用方式

### CLI 入口

CLI 适合手工调试、联调和本地排查：

```bash
python app.py --theme "冰凌火山"
```

当前 CLI 内部会直接调用：

```python
run_alchemy_glyph_router(theme, save_output=True, verbose=True)
```

也就是说，CLI 与 Python API 共享同一套主流程和结果结构，只是 CLI 默认开启了落盘和可视日志。

### Python API 入口

当前正式 Python API 函数名为：

```python
run_alchemy_glyph_router
```

真实可用的 import 方式：

```python
from alchemy_glyph_router_api import run_alchemy_glyph_router
```

这个 import 示例基于“在本仓库根目录直接运行 / 直接引用源码模块”的方式；如果后续把本项目并入更大的宿主项目，import 路径可以按宿主项目目录结构调整，但正式函数入口名称仍然是 `run_alchemy_glyph_router`。

最小调用示例：

```python
from alchemy_glyph_router_api import run_alchemy_glyph_router

result = run_alchemy_glyph_router("冰凌火山")
prompt = result["final_prompt"]
```

如果希望它像 CLI 一样同时落盘并打印日志，可以这样调用：

```python
from alchemy_glyph_router_api import run_alchemy_glyph_router

result = run_alchemy_glyph_router(
    "冰凌火山",
    save_output=True,
    verbose=True,
)
```

### Python API 签名

```python
def run_alchemy_glyph_router(
    theme: str,
    save_output: bool = False,
    verbose: bool = False,
) -> dict:
    ...
```

说明：

- `theme`：最小输入。
- `save_output=False`：默认只返回结果字典，不强制写入 `outputs/`。
- `verbose=False`：默认静默，适合被其他 Python 代码直接调用。
- 返回值是一个 `dict`，与当前 JSON 输出结构保持同构。

## 控制台输出示例

下面是一段真实运行样例：

```text
(venv) D:\projects\alchemy-glyph-router>python app.py --theme "冰凌火山"
[INFO] started_at=2026-05-07 15:36:55
[INFO] theme=冰凌火山
[INFO] route_selected=C
[INFO] route_reason=冰凌火山更偏地表裂开、寒焰与冰刺自下喷涌的生成结构。
[INFO] fallback_applied=false
[INFO] route_elapsed_ms=3280
[INFO] final_template=C_eruption_full
[INFO] generation_elapsed_ms=12425
[INFO] total_elapsed_ms=15707
[INFO] model=gpt-5.4
[INFO] output=outputs/20260507_153711_冰凌火山.json
```

说明：

- 控制台输出更适合人类观察和开发调试。
- 如果要给上层系统稳定消费，建议以返回字典或 `outputs/*.json` 为准，而不是直接解析控制台日志文本。

## Python API 返回结构

`run_alchemy_glyph_router(...)` 的返回值是一个与当前 JSON 输出同构的字典，至少包括：

- `theme`
- `route_selected`
- `route_reason`
- `fallback_applied`
- `final_template`
- `model`
- `final_prompt`
- `created_at`
- `started_at`
- `route_elapsed_ms`
- `generation_elapsed_ms`
- `total_elapsed_ms`

上层项目最常见的用法可以直接是：

```python
prompt = run_alchemy_glyph_router(theme)["final_prompt"]
```

如果需要调试信息，也可以额外读取：

- `route_selected`
- `route_reason`
- `fallback_applied`
- `final_template`
- `total_elapsed_ms`
- `model`

## JSON 输出结构说明

输出 JSON 与 Python API 返回字典是同构的。若从“接入优先级”来看，可以这样理解这些字段：

### 最小必读字段

- `final_prompt`：最终生成的完整中文提示词，也是当前模块最核心的业务输出。

### 建议保留字段

- `theme`：本次输入的主题字符串。
- `route_selected`：路由阶段原始选中的模板代号。
- `final_template`：最终实际用于生成的 full template 名称。
- `model`：本次运行实际调用的模型名。
- `total_elapsed_ms`：总耗时。

### 调试 / 诊断增强字段

- `route_reason`：路由原因的简短中文说明。
- `fallback_applied`：是否实际应用了 fallback。
- `route_elapsed_ms`：路由耗时。
- `generation_elapsed_ms`：生成耗时。
- `started_at`：本次运行启动时间。
- `created_at`：结果文件创建时间。

对接其他项目时可以这样理解：

- 如果只关心最终生成结果，最低只需要消费 `final_prompt`。
- 如果还想追踪路由质量，建议同时读取 `route_selected`、`route_reason`、`final_template`；其中 `route_selected` 是原始路由结果，`final_template` 是实际生成所用模板。
- 如果还想做性能观测，建议额外读取 `route_elapsed_ms`、`generation_elapsed_ms`、`total_elapsed_ms`。

## 完整 JSON 示例

下面是一份真实输出示例：

```json
{
  "theme": "冰凌火山",
  "route_selected": "C",
  "route_reason": "冰凌火山更偏地表裂开、寒焰与冰刺自下喷涌的生成结构。",
  "fallback_applied": false,
  "final_template": "C_eruption_full",
  "model": "gpt-5.4",
  "final_prompt": "一段高质量、极具极寒压缩感与灼热内爆张力的3D游戏技能特效视频，标准等距2.5D游戏地面投影视角，固定机位，纯黑背景，无人物，无场景，无文字，无UI，仅展示一个独立的游戏技能特效资产。整个技能绝对居中，尺寸受控，四周保留宽阔纯黑留白，所有寒雾、冰屑、晶片、蒸汽、火星、热辉、碎石与裂纹残光都不能接近画面边缘。技能必须表现为一个贴附在地面上的冰火地涌领域，而不是火山地貌、冰原景观或环境奇观。纯黑画面中央先亮起一点幽蓝与炽橙交织的冷热线核微光，下一瞬间一片半透明、寒意与热压互相撕扯的地涌领域贴地展开，整体呈严格正向扁椭圆投影，最外围是一整圈清晰而稳定的冰蓝熔金双色能量护环，护环内部是一层半透明、带有冻结纹与暗红热脉共存质感的承载地表，像被极寒封住却仍有地火在下方鼓动的受控地层。中央核心区域随即出现局部拱起与破裂，冰壳与焦黑地层同时被顶开，一道短促集中的喷涌裂口在核心处撕开，少量冰晶碎屑、白色寒汽、暗红碎岩与细小橙金火花只在边界内翻卷。一座尺度克制、轮廓凝练的冰凌火山主体从地面内部向上猛然生成，根基明确埋于地内，下部是被寒霜包覆的炽热喷涌核，上部则形成多根向上刺出的锋利冰凌与半熔半凝的火山脊冠，冰蓝晶体边缘映着赤橙熔光，内部可见局部熔流在冰壳裂缝间短暂跃动，呈现冻结与喷发同时成立的矛盾爆发感，但所有冰屑喷散、蒸汽翻腾、热辉脉动与熔火微溅都被严格收纳在扁椭圆边界内部，不扩展成真实火山喷发，也不演变成环境冰火地貌。整体视觉重点是“双色护环 + 冻裂承载地层 + 中央冰火共生破土主体”，强调力量明确自地内向上冲出、凝聚、对抗、短促爆发。短暂维持后，边界、冰凌火山主体、中央裂口、寒雾、蒸汽、火星、晶片与所有残余辉光同步迅速失光并向内收束，画面完全回归纯黑，不留残光、残屑、残焰、残雾。",
  "created_at": "2026-05-07T15:37:11.486697+08:00",
  "started_at": "2026-05-07 15:36:55",
  "route_elapsed_ms": 3280,
  "generation_elapsed_ms": 12425,
  "total_elapsed_ms": 15707
}
```

## 嵌入其他项目时的建议

- 如果作为模块嵌入其他项目，优先使用 Python API：`run_alchemy_glyph_router(...)`。
- 最低可以只消费 `final_prompt`，把它当作当前模块的核心业务产物。
- 如果需要联调、观测或路由追踪，建议同时消费 `route_selected`、`final_template`、`route_reason`、各类 `elapsed_ms`。
- 如果需要把结果保留为文件，可以在 Python API 中打开 `save_output=True`，这样得到的 JSON 与 CLI 落盘结构一致。
- 控制台日志更适合开发调试，不建议把日志文本本身当成正式接口。
- 若需要人工调试或独立联调，CLI 仍然有价值；若需要被主项目 backend 直接集成，Python API 更自然。

## Smoke Test

运行本地 smoke test：

```bash
python smoke_test.py
```

当前 smoke test 以 A-F 正式主模板树为准，不把 G 作为正式通过口径的一部分；同时已补充一个轻量 Python API 入口验证，确认 `run_alchemy_glyph_router(...)` 可以返回结构化结果。

## 阶段说明

- 本阶段完成了 A-F 主模板树收束。
- G 已暂停，不纳入正式流程，只保留实验性遗留文件。
- 当前版本适合作为一次阶段性里程碑，用于继续做稳定性修整和小范围补丁。
