# AI法阵·炼金术士

玩家扮演炼金术士，通过合成已有法阵生成新的法阵大招，并在战斗中使用它们对抗不同属性的敌人。

## 项目结构

```
alchemy-game/
  frontend/     # 前端：游戏主循环、战斗、法阵展示、炼金合成
  backend/      # 后端：FastAPI 法阵合成 API
  docs/         # 项目文档
```

## 本地运行前端

### 1. 克隆仓库

```bash
git clone https://github.com/Mr-Camel-82956648/alchemy-game.git
cd alchemy-game
```

### 2. 启动本地服务器

在 `frontend/` 目录下启动 HTTP 服务器：

```bash
cd frontend
python -m http.server 8000
```

如果 8000 端口被占用，可以改用其他端口：

```bash
python -m http.server 8080
```

### 3. 打开浏览器

访问 `http://localhost:8000`（或你指定的端口）。

> **不建议直接双击 `frontend/index.html` 打开。** 浏览器以 `file://` 协议加载时，视频资源和 fetch 请求（如加载 seed_cards.json）会因跨域限制而失败，导致法阵无法正常显示。

## 启动后端

前端默认以 `USE_MOCK = false` 连接后端，需要启动后端服务：

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 18001
```

启动后访问 `http://localhost:18001/docs` 可查看自动生成的 API 文档。

> 默认端口为 18001。如果你的机器上该端口被占用或希望使用其他端口（如 8001），同时修改启动命令和 `frontend/js/forgeAPI.js` 中的 `API_BASE` 即可。

如果不启动后端，将 `frontend/js/forgeAPI.js` 中的 `USE_MOCK` 改为 `true` 即可使用本地 mock 模式。

## 前后端模式切换

在 `frontend/js/forgeAPI.js` 中：

- `USE_MOCK = true` — 纯前端本地模拟，不需要后端
- `USE_MOCK = false` — 前端连接 `http://localhost:18001` 后端 API

## Phase 2 完成状态

前后端最小真实闭环已跑通（2026-04-30 验收通过）：

- 前端炼金合成流程通过 `POST /api/forge` 提交请求，轮询 `GET /api/forge/status/{taskId}` 获取结果
- 后端使用 FastAPI + 内存任务表，mock 生成逻辑（随机属性 + 5~10 秒延迟）
- 合成结果写入 localStorage 后，battle.js 和 alchemy.js 正常消费，新卡进入收藏夹

当前限制（后续阶段解决）：

- 后端生成逻辑为随机 mock，尚未接入真实 AI 模型
- 任务存储在内存中，后端重启后任务丢失
- 合成结果的 videoUrl 始终为 null
- 无认证鉴权、无限流

## 当前阶段目标

1. 保留现有前端玩法（已完成）
2. 统一法阵/怪物数据结构（已完成）
3. 极简属性与伤害规则（已完成）
4. 最小后端 forge 接口（已完成）
5. 前后端通信闭环（已完成）

## 设计原则

- 视觉优先，数值是视觉的翻译层
- 主属性参与战斗，副属性只记录
- 老法阵兼容迁移，新法阵优先结构化
- 资源一律通过稳定 id 管理，不通过数组位置管理

## 文档

- `docs/handover_to_cursor.md` — 项目交接说明
- `docs/roadmap.md` — 开发路线图
