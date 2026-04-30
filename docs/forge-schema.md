# Forge Schema — 法阵合成结构化协议

## 概述

法阵合成通过 `POST /api/forge` 提交请求，后端异步处理后通过 `GET /api/forge/status/{taskId}` 返回结构化结果。Phase 3 起，后端可调用真实 LLM 生成法阵名称、属性和视觉描述。

## .env 配置

| 变量 | 说明 | 示例值 |
|------|------|--------|
| `FORGE_USE_REAL_LLM` | 是否启用真实 LLM 生成 | `true` / `false` |
| `LLM_PROVIDER` | LLM 提供方标识（当前仅支持 gemini_rest） | `gemini_rest` |
| `GEMINI_API_KEY` | Gemini API Key | `AIzaSy...` |
| `LLM_MODEL` | 模型名称 | `gemini-2.0-flash` |
| `LLM_TIMEOUT_SECONDS` | 单次 HTTP 请求超时（秒） | `30` |
| `LLM_MAX_RETRIES` | 失败后重试次数 | `1` |

要切换回 mock：将 `FORGE_USE_REAL_LLM` 设为 `false`，无需改代码。

## Gemini REST 调用方式

直接通过 HTTP POST 调用，不使用 SDK：

```
POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}
```

请求体使用 `systemInstruction` 传入设计原则和输出格式要求，`contents` 传入两个父法阵信息。设置 `responseMimeType: "application/json"` 强制 JSON 输出。

## LLM 输出 Schema

LLM 被要求输出以下 JSON 结构：

```json
{
  "name": "新法阵名称（2-6个汉字）",
  "mainAttr": "fire | ice | thunder | blight",
  "subAttr": "fire | ice | thunder | blight（与 mainAttr 不同）",
  "visualDesc": "法阵视觉描述（1-2句，俯视角特效）",
  "fusionPrompt": "英文视频生成提示词（1-2句）"
}
```

## 最终返回给前端的 ForgeResult 字段

| 字段 | 类型 | 来源 | 说明 |
|------|------|------|------|
| `name` | string | LLM / fallback | 法阵名称 |
| `mainAttr` | string | LLM / fallback | 主属性（fire/ice/thunder/blight） |
| `subAttr` | string? | LLM / fallback | 副属性，与主属性不同 |
| `element` | string | 后端规则 | 等于 mainAttr，兼容旧字段 |
| `generation` | int | 后端规则 | max(parentA.gen, parentB.gen) + 1 |
| `baseAtk` | float | 后端规则 | 100 × (1 + 0.3 × (generation - 1)) |
| `videoUrl` | string? | 后端规则 | 当前始终为 null |
| `status` | string | 后端规则 | 当前固定为 `"partial"`，表示法阵结果已生成但尚无视频资源 |
| `visualDesc` | string? | LLM | 法阵视觉描述文本 |
| `fusionPrompt` | string? | LLM | 未来视频生成用的英文提示词 |
| `source` | string | 后端规则 | 必填；`"llm"` 或 `"fallback"`，表示最终结果来源 |

## 字段来源分工

**LLM 负责**（创意层）：
- name — 融合后的法阵名称
- mainAttr — 基于视觉主导特征的主属性
- subAttr — 副属性
- visualDesc — 视觉描述
- fusionPrompt — 视频生成提示词

**后端规则负责**（确定性层）：
- generation — 世代计算
- baseAtk — 攻击力计算
- element — 兼容字段，等于 mainAttr
- videoUrl — 当前为 null
- status — 当前固定 "partial"
- source — 标记最终结果来源

## 状态分层

- **任务状态**：`POST /api/forge` 与 `GET /api/forge/status/{taskId}` 使用 `pending | completed | failed`
- **ForgeResult.status**：当前 forge 结果固定为 `"partial"`，表示结果卡已生成但没有视频资源
- **前端本地状态**：`localStorage.pendingGeneration.status` 当前使用 `"done"` 作为前端本地完成标记，不属于后端接口协议

## source 语义

- `source = "llm"`：最终返回给前端的结果主要来自 LLM 输出，并通过后端规则校验
- `source = "fallback"`：仅当后端拿不到可用的结构化 LLM 结果时，才由 fallback 逻辑生成最终结果

## Fallback 机制

以下情况自动触发 fallback（回退到随机 mock 生成）：

1. `FORGE_USE_REAL_LLM=false`
2. `GEMINI_API_KEY` 未设置
3. Gemini API 调用失败（网络错误、超时、HTTP 错误）
4. Gemini 返回非 JSON 或 JSON 解析失败
5. JSON 缺少必要字段（name 或 mainAttr）
6. mainAttr 不在合法元素列表中
7. 所有重试均失败

后端 fallback 时：
- name 由元素前后缀词库随机生成 3-4 字短名
- mainAttr / subAttr 随机选取
- visualDesc / fusionPrompt 为 null
- source 标记为 "fallback"
- 所有 fallback 情况均有日志输出

说明：命名风格是否理想不再作为 fallback 条件。只要 LLM 成功返回可解析、字段合格的结构化结果，后端就优先采用该结果。

注意：前端 `USE_MOCK=true` 的本地模拟模式为了便于识别，仍会生成 `{父A名}·{父B名}之阵` 这种占位名；这不是后端 `source="fallback"` 的命名规则。

## 元素值域

合法值：`fire`, `ice`, `thunder`, `blight`

兼容别名：`poison` → `blight`（后端自动转换）

## 已知限制（Phase 3）

- 仅支持 Gemini REST，未实现 OpenAI-compatible 通路
- 任务存储在内存中，后端重启丢失
- videoUrl 始终为 null
- 无鉴权、无限流
- fusionPrompt 已生成但尚未对接视频生成服务
