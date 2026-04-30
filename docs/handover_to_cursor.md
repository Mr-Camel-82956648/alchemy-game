# AI法阵·炼金术士 项目交接说明（给 Cursor Agent）

## 0. 工作方式要求

你当前接手的是一个正在从“前端单项目原型”升级到“前后端分离原型”的游戏项目。

请严格遵守以下规则：

1. 先做计划，再改代码。
2. 先阅读指定文件，不要扫描整个项目。
3. 禁止主动扫描或分析大体积二进制资源目录。
4. 禁止读取 `_archive_docs`、`archive`、`raw_assets`、`videos` 等归档或素材目录中的大量文件。
5. 不要根据旧文档猜测需求，以本交接文档和 `docs/roadmap.md` 为准。
6. 不要做无关重构，不要顺手全面改名，不要大面积整理代码风格。
7. 当前目标是：在尽量不破坏现有前端玩法的前提下，补齐数据结构、最小后端、前后端接口和属性系统入口。

如果发现信息不足，请先列出问题并等待确认，不要自行发散设计。

---

## 1. 当前项目目标

这是一个 AI 原生游戏原型。玩家扮演炼金术士，通过自然语言描述或合成已有法阵，生成新的法阵大招。

核心链路：

1. 玩家输入 A + 输入 B
2. 后端调用融合模型，输出一段“视觉描述”
3. 后端基于同一段视觉描述解析出法阵主属性、副属性
4. 后端调用图像/视频生成能力，产出法阵视觉资源（首版允许先用假数据）
5. 前端将法阵加入当前局内法阵列表
6. 玩家在战斗中释放法阵
7. 战斗系统根据法阵主属性与怪物免疫/破盾规则结算伤害

设计原则：
- 视觉是主角，数值是视觉的翻译层
- 属性判定不面对玩家原始输入，只面对融合后的视觉描述
- 首版规则极简：主属性决定伤害是否生效，副属性只记录，不参与战斗

---

## 2. 当前阶段架构决定（已确定，不再讨论）

采用单仓库双目录结构：

- `frontend/`：现有前端玩法与战斗表现
- `backend/`：新增最小后端服务（建议 FastAPI）
- `docs/`：当前有效文档

不再把后端塞进前端项目内部。

---

## 3. 目录原则

请默认以下目录存在或将被创建：

- `frontend/`
- `backend/`
- `docs/`

如果存在以下目录，请不要重点阅读：
- `_archive_docs/`
- `archive/`
- `raw_assets/`
- 大量视频、序列帧、二进制素材目录

不要因为这些目录存在就大量读取其中内容。

---

## 4. 前后端职责边界（已确定）

### 前端职责
1. 管理当前局内法阵列表
2. 展示法阵 UI、法阵选择、战斗释放
3. 怪物生成、移动、受击、死亡等实时逻辑
4. 命中后调用本地战斗计算函数
5. 暂时不负责 AI 推理，只消费后端返回的结构化法阵结果

### 后端职责
1. 接收两个提示词或两个法阵输入
2. 生成融合后的视觉描述（首版可用 mock）
3. 解析法阵主属性、副属性（首版可用 mock 或规则假数据）
4. 生成并返回结构化法阵对象
5. 可选：返回 imageUrl / videoUrl（首版可先假数据）

### 当前不做
1. 云端玩家账号体系
2. 永久法阵收藏库
3. 数据库持久化
4. 复杂的素材生命周期管理
5. 副属性战斗效果
6. 元素抗性百分比 / 减伤 / DOT / 暴击等复杂数值系统

---

## 5. 当前明确的数值规则（已确定）

### 元素体系
四属性固定：
- 火
- 冰
- 雷
- 蚀

### 法阵规则
每个法阵结构至少包含：
- id
- name
- status
- generation
- visualDesc
- mainAttr
- subAttr
- baseAtk
- videoUrl（可选）
- imageUrl（可选）
- promptA / promptB（可选）
- legacyIndex（兼容旧前端，可选）

### generation 与 baseAtk
首版使用线性公式：

`baseAtk = 100 * (1 + 0.3 * (generation - 1))`

例如：
- 1代 = 100
- 2代 = 130
- 3代 = 160
- 4代 = 190
- 5代 = 220

### 怪物规则
- 普通怪：免疫 1 个属性
- Boss：免疫 2 个属性
- Boss 可破盾属性 = 四属性中除其免疫属性以外的另外两个属性

### 伤害规则
- 普通怪：如果法阵主属性命中怪物免疫属性，则伤害为 0，否则为 baseAtk
- Boss：如果法阵主属性在 Boss 破盾属性列表中，则伤害为 baseAtk，否则为 0
- 副属性当前不参与战斗结算，只保留为结构化字段

---

## 6. 法阵资产管理策略（已确定）

当前项目中已有三类法阵资产：

### A. 老旧占位符法阵
特点：
- 只有 MP4 或旧前端必要索引
- 没有提示词
- 没有属性
- 没有结构化元数据

处理策略：
- 先兼容纳入统一注册表
- `status = "legacy"`
- 保留 `legacyIndex`
- 不要求立即可用于完整新战斗系统

### B. 新视觉法阵
特点：
- 视觉上可用
- 有部分提示词信息
- 尚未结构化
- 没有完整属性字段

处理策略：
- 优先迁移到统一法阵结构
- `status = "partial"`
- 允许人工填写 `mainAttr` / `subAttr` / `generation` / `baseAtk`

### C. 未来 AI 原生法阵
特点：
- 来自后端生成链路
- 天然结构化

处理策略：
- 按统一结构直接入库
- `status = "complete"`

### 关键约束
- 不要通过数组位置管理法阵资源
- 必须通过稳定唯一 id 管理法阵
- 删除法阵时，不要依赖数组索引
- 资源引用通过 `videoUrl` / `imageUrl` 等路径字段完成

---



## 7. 怪物资产管理策略（已确定）

当前已有很多怪物视觉素材和动作逻辑，但尚未绑定属性系统。

处理原则：
1. 怪物素材系统与属性系统解耦
2. 每个怪物通过结构化定义绑定属性，而不是靠素材目录推断
3. 怪物定义至少包含：
   - id
   - name
   - type (`normal` / `elite` / `boss`)
   - hp
   - immuneAttrs
   - assetKey

首版中怪物属性由人工配置，不依赖 LLM 自动判断。

### 图片法阵状态说明
图片法阵功能已取消。旧代码和旧数据中的 `basic` 类型仅作短期兼容，不作为未来法阵结构的目标形态。后续新法阵统一按动态法阵 / 视频法阵方向设计。


---

## 8. 当前最重要的迁移目标

### 第一优先级：建立统一数据结构和注册表
请优先完成：

1. `Spell` 类型定义
2. `Element` 类型定义
3. `Monster` 类型定义
4. 法阵注册表（如 `spellRegistry.ts`）
5. 怪物定义表（如 `monsterDefs.ts`）
6. 战斗计算模块（如 `combat.ts`）

### 第二优先级：兼容现有前端
1. 现有法阵展示逻辑尽量改为从统一注册表读取
2. 老法阵通过 `legacy` 状态兼容
3. 新法阵优先补最小结构化字段

### 第三优先级：后端最小可用
1. 建立 FastAPI 最小服务
2. 提供：
   - `POST /api/forge`
   - `GET /api/forge/status/{taskId}`
3. 先用 mock 数据返回结构化法阵结果
4. 前端接入这个接口并轮询结果

---

## 9. 推荐的最小数据结构

### Element
```ts
type Element = "火" | "冰" | "雷" | "蚀";
```

### Spell
```ts
type SpellStatus = "legacy" | "partial" | "complete";

type Spell = {
  id: string;
  name: string;
  status: SpellStatus;

  description?: string;

  videoUrl?: string;
  imageUrl?: string;
  thumbnailUrl?: string;

  promptA?: string;
  promptB?: string;
  visualDesc?: string;

  generation?: number;
  mainAttr?: Element;
  subAttr?: Element;
  baseAtk?: number;

  legacyIndex?: number | string;

  parentA?: string | null;
  parentB?: string | null;

  createdAt?: number;
  updatedAt?: number;
};
```

### Monster
```ts
type MonsterType = "normal" | "elite" | "boss";

type Monster = {
  id: string;
  name: string;
  type: MonsterType;
  hp: number;
  immuneAttrs: Element[];
  assetKey: string;
};
```

---

## 10. 推荐的前端最小模块划分

请优先找到合适位置创建或整理以下模块（文件名可按现有项目风格调整）：

- `src/types/spell.ts`
- `src/types/monster.ts`
- `src/data/spellRegistry.ts`
- `src/data/monsterDefs.ts`
- `src/lib/combat.ts`
- `src/api/forge.ts`

如果现有项目风格不适合这些路径，可以调整，但请保持职责清晰。

---

## 11. 推荐的后端最小模块划分

建议使用 FastAPI，建立：

- `backend/app/main.py`
- `backend/app/routes/forge.py`
- `backend/app/models/forge.py`
- `backend/app/services/forge_service.py`
- `backend/app/services/task_store.py`
- `backend/app/services/llm_service.py`
- `backend/app/services/image_service.py`

首版允许：
- `llm_service.py` 返回 mock
- `image_service.py` 返回 mock URL

---

## 12. 当前不允许做的事情

1. 不要为了“更优雅”大规模重构前端目录
2. 不要把所有旧法阵一次性重做
3. 不要引入数据库
4. 不要引入复杂权限系统
5. 不要提前设计云端用户系统
6. 不要把副属性加入战斗
7. 不要实现复杂元素连锁
8. 不要做大规模资源重命名，除非有明确必要

---

## 13. 当前开发顺序（严格按此执行）

### Phase 1
- 识别前端入口文件和当前法阵数据入口
- 建立统一类型定义
- 建立法阵注册表
- 先把一小批法阵纳入新结构（包括 legacy + partial）

### Phase 2
- 建立怪物定义表
- 建立战斗数值函数
- 让现有战斗逻辑开始消费结构化法阵和怪物属性

### Phase 3
- 新建 backend 最小服务
- 实现 mock forge API
- 前端接入 forge API

### Phase 4
- 逐步把更多新法阵从 partial 升级到 complete
- 再考虑接入真实 LLM / 生图 / 生视频服务

---

## 14. 开始工作前必须先向我确认的几个问题

在真正修改代码前，请先基于实际代码阅读结果，向我确认以下问题：

1. 当前前端法阵数据入口文件在哪里？
2. 当前前端怪物数据入口文件在哪里？
3. 当前法阵播放逻辑主要由哪些文件控制？
4. 哪些目录明显是大体积素材目录，后续应避免扫描？
5. 你建议的最小改造文件清单是什么？
6. 第一阶段你计划先迁移哪几份文件，为什么？

确认后再开始改代码。
