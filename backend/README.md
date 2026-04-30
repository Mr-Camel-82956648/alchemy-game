# Backend — AI 法阵生成服务

## 当前状态

Phase 3：后端支持真实 LLM（Gemini REST）生成结构化法阵结果。LLM 失败时自动回退到随机 mock 生成。

## 安装与启动

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 18001
```

启动后访问 `http://localhost:18001` 确认服务状态，或访问 `http://localhost:18001/docs` 查看 API 文档。

> 默认端口为 18001。如需更换端口，同时修改启动命令和 `frontend/js/forgeAPI.js` 中的 `API_BASE`。

## .env 配置

在项目根目录创建 `.env` 文件（已被 .gitignore 排除）：

```env
FORGE_USE_REAL_LLM=true
LLM_PROVIDER=gemini_rest
GEMINI_API_KEY=你的Gemini API Key
LLM_MODEL=gemini-2.0-flash
LLM_TIMEOUT_SECONDS=30
LLM_MAX_RETRIES=1
```

| 变量 | 说明 |
|------|------|
| `FORGE_USE_REAL_LLM` | `true` 启用 LLM，`false` 使用 mock |
| `LLM_PROVIDER` | 当前仅支持 `gemini_rest` |
| `GEMINI_API_KEY` | Gemini API 密钥 |
| `LLM_MODEL` | 模型名称 |
| `LLM_TIMEOUT_SECONDS` | HTTP 超时秒数 |
| `LLM_MAX_RETRIES` | 失败重试次数 |

## Gemini REST 调用

不使用 SDK，直接 HTTP POST：

```
POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}
```

使用 `systemInstruction` 传入设计原则，`responseMimeType: "application/json"` 强制 JSON 输出。详见 `docs/forge-schema.md`。

## API 接口

### POST /api/forge

提交法阵合成请求。

请求体：

```json
{
  "spellA": { "id": "abc123", "name": "法阵·01", "mainAttr": "fire", "generation": 1 },
  "spellB": { "id": "def456", "name": "法阵·02", "mainAttr": "ice", "generation": 1 }
}
```

响应：

```json
{ "taskId": "task_a1b2c3d4e5f6", "status": "pending" }
```

### GET /api/forge/status/{taskId}

响应（已完成，LLM 生成）：

```json
{
  "taskId": "task_a1b2c3d4e5f6",
  "status": "completed",
  "result": {
    "name": "雷焰阵",
    "mainAttr": "fire",
    "subAttr": "thunder",
    "element": "fire",
    "generation": 2,
    "baseAtk": 130.0,
    "videoUrl": null,
    "status": "partial",
    "visualDesc": "中心燃烧的火焰漩涡中穿插电弧闪烁",
    "fusionPrompt": "A swirling fire vortex with lightning arcs...",
    "source": "llm"
  },
  "error": null
}
```

## Fallback 机制

LLM 调用失败（网络错误、解析失败、校验不通过）时自动回退到随机 mock：
- `source` 标记为 `"fallback"`
- 所有 fallback 均有日志输出
- 前端无感知差异

## 切换回 mock

将 `.env` 中 `FORGE_USE_REAL_LLM` 设为 `false` 并重启后端。

## 目录结构

```
backend/
  requirements.txt
  app/
    main.py                  # FastAPI 入口 + CORS + 加载 .env
    models.py                # Pydantic 请求/响应模型
    routes/
      forge.py               # forge API 路由
    services/
      forge_service.py       # 任务调度 + 规则计算 + fallback
      llm_client.py          # Gemini REST 调用 + JSON 校验
```

## 当前限制

- 仅支持 Gemini REST，未实现 OpenAI-compatible 通路
- 任务存储在内存中，后端重启丢失
- videoUrl 始终为 null
- 无认证鉴权、无请求限流
- fusionPrompt 已生成但尚未对接视频生成服务

## 详细 Schema 文档

见 `docs/forge-schema.md`
