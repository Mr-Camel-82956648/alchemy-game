# Backend — AI 法阵生成服务

## 当前状态

Phase 2 最小可用后端，使用 FastAPI 提供法阵合成 API。当前为 mock 生成逻辑（随机属性 + 延迟），后续可接入真实 AI 模型。

## 安装与启动

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 18001
```

启动后访问 `http://localhost:18001` 确认服务运行，或访问 `http://localhost:18001/docs` 查看自动生成的 API 文档。

> 默认端口为 18001。如需更换端口，同时修改启动命令和 `frontend/js/forgeAPI.js` 中的 `API_BASE`。

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
{
  "taskId": "task_a1b2c3d4e5f6",
  "status": "pending"
}
```

### GET /api/forge/status/{taskId}

查询合成任务状态。

响应（进行中）：

```json
{
  "taskId": "task_a1b2c3d4e5f6",
  "status": "pending",
  "result": null,
  "error": null
}
```

响应（已完成）：

```json
{
  "taskId": "task_a1b2c3d4e5f6",
  "status": "completed",
  "result": {
    "name": "法阵·01·法阵·02之阵",
    "mainAttr": "thunder",
    "subAttr": "fire",
    "element": "thunder",
    "generation": 2,
    "baseAtk": 130.0,
    "videoUrl": null,
    "status": "complete"
  },
  "error": null
}
```

## 前端对接

前端通过 `frontend/js/forgeAPI.js` 中的 `USE_MOCK` 开关控制模式：

- `USE_MOCK = true`：前端本地模拟，不需要启动后端
- `USE_MOCK = false`：前端请求 `http://localhost:18001`，需要启动后端

## 目录结构

```
backend/
  requirements.txt
  app/
    main.py              # FastAPI 入口 + CORS
    models.py            # Pydantic 请求/响应模型
    routes/
      forge.py           # forge API 路由
    services/
      forge_service.py   # 内存任务表 + mock 生成逻辑
```

## 当前限制

- 生成逻辑为随机 mock（随机属性 + 5~10 秒延迟），尚未接入真实 AI 模型
- 任务存储在内存字典中，后端重启后所有进行中的任务丢失
- 合成结果的 `videoUrl` 始终返回 `null`
- 无认证鉴权、无请求限流
