# Design

## 1. 技术栈

| 项 | 选择 |
|---|---|
| 运行时 | Node 22，TypeScript strict，ESM |
| 包管理 | pnpm workspace，`save-exact=true`，提交 lockfile，不用 Turborepo/Nx |
| 构建 | `tsc -b`（project references）；web 用 Vite |
| HTTP | Express 5（A2A SDK 只提供 Express 适配器） |
| 契约/校验 | Zod |
| 存储 | better-sqlite3，每个服务一个 SQLite 文件，位于 `var/data/` |
| 测试 | Vitest |
| 日志 | pino，JSON |
| Lint/格式 | Biome |
| 追踪 | `@opentelemetry/api` + W3C traceparent，SDK 在 P0 确认 |
| 前端 | Vite + React，单页包含工作台、`/console`、演示控制 |
| 外部依赖 | `@earendil-works/pi-durable` 1.3.0、`@a2a-js/sdk` 1.3.0、`@typesafe-ai/sdk` 0.7.0（模型 `jev-1.14.0`）、OpenTelemetry API 1.9.1；详见 `docs/m0-findings.md` |

## 2. 目录

```
apps/
  coordinator/            订单版本、规则图调度、人工任务、整单状态、放行事务
  cargo-assurance/        货件规则 + Jev 判断
  transport-planning/     运输段规则 + 调查 Agent
  commercial-control/     授信与费用规则
  web/                    工作台 + Console + 演示控制
packages/
  contracts/              Zod 契约：ids、shipment、check、humanTask、artifact、events
  rule-engine/            纯函数：配置校验、组合器、求值、失效计算
  store/                  SQLite 连接、迁移、幂等操作表、outbox
  human-tasks/            人工任务纯状态机：角色校验、过期、版本绑定、替代、人工门槛状态
  observability/          事件 schema、logger、trace 上下文
  model-providers/        SemanticJudge 接口：jev、structured-output、scripted
  agent-harness/          AgentRuntime 接口与控制点：in-memory、pi-durable
  a2a-adapter/            业务任务 ↔ A2A Task 映射，server/client 封装
  service-kit/            服务启动样板：Express、健康检查、本地控制端点
tools/
  launcher/               一键启动、按名称杀/重启进程（演示控制端调用）
spikes/                   P0 一次性验证，不被正式代码依赖
eval/
  materials/              policy-v1.md、rules.json、cases/、mock-data/、event-scripts
  blind/                  盲测标准答案，仅 runner 读取
  runner/                 回放、故障注入、benchmark
docs/                     用户文档
var/                      运行时数据与日志，gitignore
```

依赖方向：`apps → packages`；`rule-engine`、`human-tasks` 和 `contracts` 不依赖任何 IO 包；`agent-harness` 不依赖具体业务。

## 3. 工程约定

- 命名表达业务含义（`evaluateRuleGraph`、`invalidateDependentsOf`），不用缩写。
- 不写解释性注释；需要解释的逻辑拆成命名良好的函数。
- 函数小、纯函数优先；IO 集中在 app 边界。
- 测试轻量：每个包挑关键语义写少量 Vitest，不追求覆盖率。
- 所有时间 UTC，金额整数分，重量克，温度 0.1°C 整数。

## 4. 一键体验

| 命令 | 作用 |
|---|---|
| `pnpm bootstrap` | install + build 全部 |
| `pnpm start` | launcher 启动 4 个服务 + web，打印访问地址 |
| `pnpm demo:reset` | 清库并载入 LOG-001 ~ LOG-008 |
| `pnpm test` | 全部 unit test |
| `pnpm faults` | 跑故障场景 runner，输出报告到 `var/reports/` |
| `pnpm bench` | 跑 benchmark，输出报告到 `var/reports/` |

`.env.example` 提供 `MODEL_MODE=scripted|live`、`TYPESAFE_API_KEY`、`NVIDIA_API_KEY`（暂缓）。默认 `scripted`，无 key 可完整演示。

Web 中的演示控制（仅本地演示模式开启）：选择案例、扮演角色、执行人工审批/现场动作、修改订单触发失效、杀死/重启服务、注入超时、重复提交。

## 5. 规则引擎语义

### 5.1 状态

`PASS | FAIL | UNKNOWN | NOT_APPLICABLE | ERROR | BLOCKED_DEPENDENCY | WAITING_HUMAN | INVALIDATED`

每个 check 同时保存 `observedValue`（事实，如"存在越界"）和 `gateStatus`（门槛结论），二者不混用。

### 5.2 规则定义

```ts
type RuleDefinition = {
  ruleId: string
  version: string
  scope: 'order' | 'cargoItem' | 'leg'
  appliesWhen?: Expression
  dependsOn: string[]
  evaluator: { kind: 'code' | 'decisionTable' | 'semantic' | 'humanGate' | 'combinator'; ref: string }
  combiner?: Expression
  unknownPolicy: 'block' | 'escalateToHuman'
  inputPaths: string[]
  parameters: string[]
  humanGate?: { taskType: 'APPROVAL' | 'OPERATION'; requiredRole: Role }
  invalidationTriggers: string[]
}
```

`Expression` 为 `and | or | not | ifThen | allOf(scope) | anyOf(scope) | ref(ruleId)` 的 JSON 树。`ifThen` 的分支字段名为 `consequence`（避免 `then` 使对象成为 thenable）。`parameters` 列出规则使用的 policy 参数名，供配置校验。

### 5.3 组合语义

把非终态统一称为 pending：`UNKNOWN | BLOCKED_DEPENDENCY | WAITING_HUMAN | INVALIDATED`。

| 组合器 | 规则 |
|---|---|
| `and` | 有 FAIL → FAIL；否则有 ERROR → ERROR；否则有 pending → 最先出现的 pending；否则全 PASS → PASS。NOT_APPLICABLE 子项忽略；忽略后为空 → NOT_APPLICABLE |
| `or` | 有 PASS → PASS；否则有 pending/ERROR → 该状态；全 FAIL → FAIL |
| `not` | PASS ↔ FAIL，其余原样（UNKNOWN 不能变成 PASS） |
| `ifThen(c, t)` | c 为 FAIL/NOT_APPLICABLE → NOT_APPLICABLE；c 为 PASS → t；c 为 pending → BLOCKED_DEPENDENCY |
| `allOf(scope, e)` | 集合为空 → UNKNOWN（不默认合格）；否则对成员 `and` |
| `anyOf(scope, e)` | 集合为空 → UNKNOWN；否则对成员 `or` |

依赖未完成时规则本身为 BLOCKED_DEPENDENCY，并记录 `blockedBy`。

规则层的阻塞语义（按现实操作常识）：

- WAITING_HUMAN 只属于人工门槛本身。任何直接依赖或在组合中嵌套引用它的规则，状态是 BLOCKED_DEPENDENCY，不是 WAITING_HUMAN。
- 组合规则（combinator）的表达式求值结果若为 pending，且存在未决的上游，规则状态为 BLOCKED_DEPENDENCY，`blockedBy` 记录直接上游。
- 没有上游可等的 pending（如 `allOf` 空集合的 UNKNOWN）保持原状态，不伪装成被阻塞。
- 上表的组合语义只用于表达式内部求值；界面沿 `blockedBy` 追溯到根因（等待中的人工门槛或 UNKNOWN 规则），并显示需要的角色。

### 5.3.1 规则建模约定（T3.1）

- **条件规则**（ID 带后缀，如 `R04-COLD`、`R04-CONTROLLED`、`R18-RISK`、`R19-EXCURSION`、`R21-REQUIRED`、`R32-OVER`、`R35-REQUIRED`）：情况成立为 PASS，不成立为 NOT_APPLICABLE，从不 FAIL。只供 `appliesWhen` 引用。
- **事实 vs 门槛**：R18、R19 的 gateStatus 表示"检查已完成"，异常事实放 observedValue；是否触发后续流程由条件规则决定。
- **人工门槛拆分**：一个门槛一个角色。R39 = `R39-LOAD` + `R39-CONFIRM`；R22 = `R22-CAPTURE`（仓库采集复测读数）+ R22（代码判定读数在温区内）；R35 = `R35-REQUIRED`（代码）+ R35（商务主管审批）。
- **R20 处置**：批准时可带 `conditions: ['REWORK_REQUIRED']`；`R20-REWORK` 读取该条件。
- **R38**：组合规则，聚合装载前人工门槛（R13、R20、R21、R22-CAPTURE、R34、R35），NOT_APPLICABLE 忽略；没有任何装载前任务时为 NOT_APPLICABLE。
- **不确定转人工**：`unknownPolicy: 'escalateToHuman'` 必须带 `humanGate`（复核角色）。语义判断 UNKNOWN 时 Coordinator 创建该角色的复核任务：批准 → PASS，拒绝 → FAIL。
- **证据**：`CaseEvidence`（资料、温控记录、检查备注）与 `Shipment` 分开提交与存储。
- **决策表**：混装兼容矩阵 `decision-tables/mixing-matrix.json`；中转能力取 reference data 的 hubs。

### 5.4 配置校验

启动时校验：引用存在、表达式类型、无环（拓扑排序）、参数存在于 `mock-policy-parameters`、`escalateToHuman` 必须带 `humanGate`。失败则服务拒绝发起放行。

### 5.5 失效与增量重算

- 每个 check 记录 `inputFingerprint = hash(inputPaths 的值 + 实体版本 + 上游结果 id)`。
- 实体变更 → 由 `invalidationTriggers` 找到直接受影响规则 → 沿依赖图向下游传递 → 标记 INVALIDATED → 只重算这部分。
- 人工任务绑定 `targetVersion` 与 `inputFingerprint`；指纹变化即失效，并创建 `supersededBy` 关联的新任务。
- 晚到结果的指纹与当前不符时只归档。

## 6. 服务与流程

- Coordinator 拥有订单版本和整单规则图（R01–R40 的聚合层），通过各服务接口获取分支结果；依赖调度是确定性状态机。
- 业务服务暴露原生 HTTP 任务接口；`a2a-adapter` 在其上包一层 A2A server（B4 对照）。
- 人工任务由 Coordinator 持有；角色身份由请求头 `x-demo-role` 模拟，服务端校验权限。

### 6.1 分支服务拆分（T3.2）

| 服务 | 负责的 `branch` | 自有数据 |
|---|---|---|
| coordinator | base、release | 订单、人工任务、检查结果 |
| cargo-assurance | controlled、coldChain | 求值记录 |
| transport-planning | plan | 求值记录、运输预订（幂等操作表） |
| commercial-control | commercial | 求值记录 |

- 求值代码在 `packages/rule-evaluation`（叶子规则、决策表、配置加载、`evaluateBranch`），各服务只启用自己的分支；规则集仍是同一个 `rules.json`。
- 原生接口 `POST /evaluations`：请求带订单、证据、语义答案、本服务规则引用的上游结果、相关人工门槛的当前状态（状态、决定、操作字段）；响应带本服务规则的求值结果和 `humanGateRequests`（到达但没有有效任务的人工门槛，含"不确定转人工"）。服务把这些门槛视为 WAITING_HUMAN。
- Coordinator 通过 `BranchEvaluator` 接口调用（进程内或 HTTP，同一求值代码）。启动时由规则依赖算出分层（T3.3）：同层并行，层间按依赖顺序；当前为 [base、commercial] → [cargo-assurance] → [transport-planning] → [release]。每个服务只收到它的规则引用的上游结果。重复或遗漏覆盖、循环依赖都拒绝启动。
- 人工任务仍由 Coordinator 创建与持有；服务不直接改人工任务。
- 放行：先求值（确认视为已批准），再在同一 SQLite 事务内重读订单，版本或确认任务状态已变则返回 CONFLICT；否则写入批准、检查结果，R40 通过才写 DISPATCHED，不通过整体回滚（乐观并发）。
- 放行：调度员确认时在同一 SQLite 事务内重读当前版本、重新求值 R40，通过才写 DISPATCHED。
- R39 拆为两个人工门槛 `R39-LOAD`（仓库操作员，装载扫码与复核证据）与 `R39-CONFIRM`（调度员确认），R39 为二者 AND。调度员确认在放行事务内记录；R40 不通过则整个事务回滚，确认也不保留。

## 7. Runtime harness

### 7.1 接口

```ts
interface AgentRuntime {
  open(sessionKey: SessionKey): Promise<AgentSession>
}
interface AgentSession {
  submit(request: { requestId: string; input: InvestigationInput }): Promise<RunHandle>
  resume(): Promise<void>
  events(): AsyncIterable<AgentEvent>
  close(): Promise<void>
}
type ToolDefinition = {
  name: string
  access: 'read' | 'write'
  replayPolicy: 'replaySafe' | 'verifyByOperationId'
  allowedCallers: ('agent' | 'system')[]
  inputSchema: ZodType
  execute(input, context: ToolContext): Promise<ToolResult>
}
```

实现：`InMemoryAgentRuntime`（B3 的 A 组）、`PiDurableAgentRuntime`（B 组）。

### 7.2 控制点

| 控制 | 落点 |
|---|---|
| 工具白名单与调用方限制 | `ToolRegistry`，按服务注册；审批、现场动作、应用计划、发运不注册给 agent |
| 预算 | `RunBudgetGuard`：工具调用 10、模型重试 3、自动补资料 2 轮、30s 目标、60s 硬停 |
| 写操作幂等 | `ToolContext.operationIdFor(logicalActionId)` 由服务端生成；业务库唯一约束 |
| 崩溃后不重放副作用 | `replayPolicy=verifyByOperationId`：恢复时先查 `get_operation_status` |
| 输入通道隔离 | `ContextAssembler`：政策/系统指令与资料文本分区，资料只作为数据 |
| 输出无权限 | agent 只能 `submit_investigation_result`；结论由规则引擎和人工门槛决定 |
| 版本绑定 | 结果携带 `caseRevision` 与指纹，提交时校验 |
| 循环/反复崩溃 | 预算守卫 + 重启上限（本项目实现，Pi 1.3.0 无 restartLimit），超限转人工 |
| 可追溯 | 每个 run、tool、model 调用发出 `observability` 事件 |

每一行在 `docs/runtime-controls.md` 对应一个证据测试或故障场景。

## 8. 模型适配

```ts
interface SemanticJudge {
  ask(question: SemanticQuestion, state: SemanticState): Promise<SemanticAnswer>
}
```

实现：`JevJudge`、`StructuredOutputJudge`、`ScriptedJudge`（按 questionId + 输入哈希回放）。`SemanticAnswer` 保留 provider 原始字段和业务映射结果。

- state 只放该问题 `inputPaths` 对应的字段；资料文本作为数据分区，不与指令混放。
- 门槛判定只用映射后的离散结论；Choice 的 confidence 由 probabilities 推出，不当作独立信号。
- B1 对 Choice 问题增加选项顺序打乱的变体，测位置偏差。

## 9. 可观测性

- 事件写各服务 outbox 表，`observability` 收集器汇入 `var/data/observability.sqlite`；Console 通过查询 API + SSE 读取。
- 标识约定按 PRD 15.2；跨服务通过 HTTP `traceparent` 传播。
- 业务正确性不依赖观察库。

## 10. 状态机

所有持久化状态用 `contracts` 中的 `defineStateMachine` 定义：状态、允许的转移、初始态；没有出边的状态即终态。任何写状态的代码都经过 `machine.transition(from, to)`，非法转移抛错；同态转移视为 no-op。

| 状态机 | 状态 | 终态 | 谁触发 |
|---|---|---|---|
| 订单 `orderStatusMachine` | SUBMITTED → EVALUATING → ON_HOLD / AWAITING_HUMAN / READY_TO_DISPATCH / TECHNICAL_FAILURE（相互可转）→ DISPATCHED（只从 READY_TO_DISPATCH，经放行事务）或 REJECTED | DISPATCHED、REJECTED | Coordinator 求值后派生；放行事务 |
| 人工任务 `humanTaskMachine` | OPEN → APPROVED / REJECTED / COMPLETED / EXPIRED / CANCELLED / SUPERSEDED；APPROVED / REJECTED / COMPLETED → SUPERSEDED（目标版本变化时） | EXPIRED、CANCELLED、SUPERSEDED | 角色命令、到期、版本变化 |
| 运输预订 `reservationMachine` | RESERVED → CANCELLED | CANCELLED | 预订 / 取消工具 |

规则门槛状态（GateStatus）不是状态机：它是规则输入、上游结果和人工任务的纯函数，每次求值重算，不做转移校验。

终态订单不再重新求值，也不接受人工任务命令（返回 CONFLICT）。目标版本变化时，旧任务无论处于 OPEN 还是已决定，都转为 SUPERSEDED 并记录 `supersededBy`，旧决定不复用。

## 11. 工作台流程图视图

默认视图是规则流程图（React Flow + dagre 自动布局，左→右，终点 R40）；规则树保留为第二个 tab。

- 节点 = 规则，状态为跨货件/运输段的聚合：FAIL > ERROR > WAITING_HUMAN > BLOCKED_DEPENDENCY > UNKNOWN > INVALIDATED > PASS > NOT_APPLICABLE（全部 N/A 才是 N/A）。
- 边 = 上游 → 下游，样式由上游状态决定：PASS 绿色流动；WAITING_HUMAN 琥珀静止；BLOCKED/UNKNOWN/INVALIDATED 灰色虚线静止；FAIL/ERROR 红色静止；N/A 淡灰。
- 人工门槛节点单独形状并标角色；等待中时呼吸提示。
- N/A 规则默认隐藏（可切换）。点击节点显示各实体状态、observedValue 与根因阻塞。
- `prefers-reduced-motion` 时不播放动画，只靠颜色和线型区分。
