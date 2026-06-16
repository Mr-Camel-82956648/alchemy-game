# Alchemy Game

一个前端游戏加 Node 后端的炼金法阵原型。玩家通过合成已有法阵生成新法阵，并在 4-wave 战斗中使用属性命中机制对抗怪物。当前后端已经迁移到 `backend-node/`，不再需要 Python/FastAPI 运行时。

## 启动

推荐直接让 Node 后端同时托管 API 和静态文件：

```powershell
cd backend-node
$env:ALCHEMY_SERVE_STATIC='1'
npm start
```

然后访问：

- `http://127.0.0.1:18001/frontend/`
- `http://127.0.0.1:18001/api/debug/llm-config`
- `http://127.0.0.1:18001/api/assets/cards`

也可以分离启动前端静态服务：

```powershell
python -m http.server 8000
```

访问 `http://127.0.0.1:8000/frontend/`。前端在本地 `8000/8080` 端口会自动调用 `http://localhost:18001` 的 Node 后端。

## 配置

真实敏感配置文件放在 `backend-node/.env`，模板是 `backend-node/.env.example`。真实 `.env` 已被 `.gitignore` 和 `.dockerignore` 排除，不要提交。

关键配置包括：

- `LLM_BASE_URL`
- `LLM_API_KEY`
- `OPENAI_COMPAT_MODEL`
- `INTERNAL_API_PASSWORD`
- `PIXVERSE_API_KEY`

## 资源

- 内置卡牌素材：`backend-node/resources/assets/cards/`
- forge 语义提示词：`backend-node/resources/prompts/`
- glyph router 模板：`backend-node/resources/glyph-router-templates/`
- 运行态数据：`backend-node/data/`

## 测试

```powershell
cd backend-node
npm run smoke
```

smoke test 会禁用真实 LLM key，只验证本地服务、资产、quota、forge fallback 和卡牌视频状态 API。

## Docker

```powershell
cd backend-node
docker compose up --build
```

Docker compose 默认读取 `backend-node/.env`，并把运行态数据持久化到 `backend-node/data/`。

## 常用入口

- `GET /api/health`
- `GET /api/debug/llm-config`
- `GET /api/debug/pixverse/config`
- `GET /api/debug/pixverse/tasks`
- `GET /api/assets/cards`
- `POST /api/forge`
- `GET /api/forge/status/{taskId}`
- `POST /api/video/pixverse/from-card/{cardId}`
- `GET /api/video/pixverse/card/{cardId}`
