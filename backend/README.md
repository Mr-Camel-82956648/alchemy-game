# Backend — AI 法阵生成服务

当前阶段后端尚未实现。前端主要依赖本地 mock 流程完成合成闭环。

## 计划

后续 Phase 中将在此目录下使用 FastAPI 构建最小后端服务，提供：

- `POST /api/forge` — 提交法阵合成请求
- `GET /api/forge/status/{taskId}` — 轮询合成结果

首版后端将以 mock 数据返回结构化法阵对象，后续逐步接入真实 AI 生成能力。

## 前端对接方式

前端通过 `frontend/js/forgeAPI.js` 中的 `USE_MOCK` 开关控制是否调用真实后端：

- `USE_MOCK = true`（当前默认）：前端本地模拟合成，不依赖后端
- `USE_MOCK = false`：前端将请求发送到 `http://localhost:8000`
