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
  coordinator/            订单协调 agent：接单、订单版本、汇总、整单规则（R01、R02、R08、R37–R40）、放行、调度员确认
  cargo-assurance/        货物合规 agent：R03、R04、R09–R15、R17–R23；合规/质量/仓库人工任务
  transport-planning/     运输计划 agent：R05–R07、R16、R24–R26、R28–R30；调查助手、计划员确认
  commercial-control/     商务 agent：R27、R31–R36 + CUST-* 扩展规则；商务审批
  destination-compliance/ 目的地合规 agent（扩展演示）：R41 + DEST-* 扩展规则，用 agent 模板新增
  web/                    工作台 + Console + 演示控制
packages/
  contracts/              Zod 契约：ids、shipment、check、humanTask、artifact、events
  rule-engine/            纯函数：配置校验、组合器、求值、失效计算
  store/                  SQLite 连接、迁移、幂等操作表、outbox
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

依赖方向：`apps → packages`；`rule-engine` 和 `contracts` 不依赖任何 IO 包；`agent-harness` 不依赖具体业务。

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

`.env.example` 提供 `MODEL_MODE=scripted|live`、`TYPESAFE_API_KEY`、`NVIDIA_API_KEY`。默认 `scripted`，无 key 可完整演示。

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
  humanGate?: {
    taskType: 'APPROVAL' | 'OPERATION'
    steps: { requiredRole: Role; appliesWhen?: Expression }[]   // 1–3 个角色
    mode: 'sequential' | 'parallel'
    distinctActors: boolean                                      // 四眼原则：同一人不能签两步
  }
  invalidationTriggers: string[]
}
```

叶子求值方式：

| kind | 配置 | 由谁执行 | 谁来写 |
|---|---|---|---|
| `expression` | `expression.passWhen`（FEEL，true/false/null → PASS/FAIL/UNKNOWN），可选 `observe` | rule-engine 内置 | 编写 agent 生成，人工审核 |
| `semantic` | `semantic`：问题（choice / noul）、`state`（FEEL 取值）、`passWhen`（choiceIn / probabilityAtLeast / probabilityAtMost） | agent 层用 SemanticJudge（Jev） | 编写 agent 生成 |
| `humanGate` | `humanGate`：步骤、模式、四眼、`evidenceRequirements`、`expiresAfterHours` | agent 层用人工任务状态机 | 编写 agent 生成 |
| `combinator` | `combiner` 表达式树 | rule-engine 内置 | 编写 agent 生成 |
| `code` / `decisionTable` | `evaluator.ref` 指向注册的函数 | agent 层注册的手写代码 | 人；计入"手写代码"指标 |

FEEL 上下文：`order`、`cargoItems`、`legs`、当前成员 `item` 或 `leg`、`params`（政策参数）。表达式里的 `params.X` 必须在规则的 `parameters` 中声明，且存在于政策参数；FEEL 语法在启动校验时检查。

`Expression` 为 `and | or | not | ifThen | allOf(scope) | anyOf(scope) | ref(ruleId)` 的 JSON 树，以 `op` 区分；`ifThen` 用 `condition`/`consequence` 字段（避免 `then` 被当作 thenable）。另有两个叶子：`fact(path, equals|includes)` 读输入事实（`order.` 前缀读订单级，否则读当前作用域成员），`observed(ruleId, equals|includes)` 读上游规则的 observedValue（如 R04 判定的分支）；值缺失为 UNKNOWN。

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

图求值（`evaluateRuleGraph`）按拓扑序、按作用域成员逐实例求值：

1. `appliesWhen`：FAIL/NOT_APPLICABLE → 本规则 NOT_APPLICABLE；pending → BLOCKED_DEPENDENCY；ERROR → ERROR。
2. 组合规则直接求 `combiner`，不做依赖门控（组合语义自己处理 pending）。
3. 叶子规则：`dependsOn` 中除 `appliesWhen` 已引用者外，每个依赖必须为 PASS 或 NOT_APPLICABLE，否则 BLOCKED_DEPENDENCY 且 `blockedBy` 列出这些依赖；订单级规则依赖货件/运输段级规则时按 ALL 聚合（空集合为 UNKNOWN）。像 R33"仅 R32 失败时"这类规则，把 R32 写进 `appliesWhen`，就不会被 R32 的 FAIL 门控。
4. 求值器抛错 → ERROR；缺求值器 → ERROR；返回 UNKNOWN 且 `unknownPolicy = escalateToHuman` → 记入 `escalations`，由人工任务模块（T1.7）创建任务。

### 5.4 配置校验

启动时校验：引用存在、表达式类型、无环（拓扑排序）、参数存在于 `mock-policy-parameters`。失败则服务拒绝发起放行。

### 5.5 失效与增量重算

- 每个 check 记录 `inputFingerprint = hash(inputPaths 的值 + 实体版本 + 上游结果 id)`。
- 实体变更 → 由 `invalidationTriggers` 找到直接受影响规则 → 沿依赖图向下游传递 → 标记 INVALIDATED → 只重算这部分。
- 人工任务绑定 `targetVersion` 与 `inputFingerprint`；指纹变化即失效，并创建 `supersededBy` 关联的新任务。
- 多角色审批链：每一步是一个独立的 APPROVAL 人工任务（单一角色，带 `approvalChain` 的 chainId/stepIndex/stepCount/mode）。顺序模式下前一步批准后才创建下一步；并行模式下同时创建。全部批准 → 门槛 PASS；任一拒绝 → FAIL 并取消其余步骤；任一过期 → 该链失效，需重新发起；失效时整条链被新链替代。`distinctActors` 时同一人不能批准同链两步，同角色两步即"双人复核"。步骤可带 `appliesWhen`（如受控货追加合规审核员、超二级额度追加第二名商务主管）。在 Pi Durable 中，一条链是父任务依次等待的子任务。实现在 `packages/human-tasks`：`decideHumanTask` 校验角色、过期、目标版本（指纹）、证据字段、步骤顺序与四眼原则后才落定；`chainOutcome` / `stepsToOpen` / `gateStatusOf` 计算链状态、该开哪几步、门槛状态。链过期或被取消/替代时门槛为 UNKNOWN，由所属 agent 重新发起新链。
- 晚到结果的指纹与当前不符时只归档。
- 实现：`markInvalidated` 先把受影响结果标为 INVALIDATED 并记 `invalidatedBy`（变更 id，供 UI 显示"哪次变更导致失效"）；`evaluateRuleGraph(..., { previous })` 重算时，code / decisionTable / semantic 规则指纹不变即复用（不重复调用 Jev），humanGate 与组合规则每次重新求值。实体版本是订单级的，改一个运输段会让同一触发下所有运输段重算：保守，不会误复用。

## 6. 服务与流程

- 术语："agent" 只指 Durable Jev Agent（对外 A2A 身份 + 内部 Jev + Pi Durable + 规则包）。会自己选工具的 LLM 循环称"调查助手"，是 agent 内部的可选部件。
- 协作模式（均走 A2A）：派单与汇总（订单协调 agent ↔ 各 agent，每个"订单版本 × 能力"一个 A2A Task）；点对点请求（运输 → 商务：改派额外费用审批 R35；运输 → 货物：候选计划的冷链/受控复核 R28/R16/R26）；变更通知与失效（换承运商 → 货物 agent 的 R13 审批链失效重发）；人工/补材料统一为 `input-required`。agent 之间不共享数据库、不调用对方内部代码，约定只有 Agent Card 与 `contracts` 中的业务结果契约。
- 扩展：新 agent 用同一模板（service-kit + 规则包 + Agent Card）起服务，订单协调 agent 经 Agent Card 发现，R40 增加一个依赖；已有 agent 不改代码。拆分依据是业务责任、审批人、发布节奏、数据归属，不是规则数量。
- 每个业务模块是一个 Durable Jev Agent（spec 8）：持有本模块规则图、叶子求值、人工任务与等待状态，通过 Pi Durable 在等待人工和进程重启后恢复。
- 模块流程实现为 Pi Durable durable task（不经 LLM）：分阶段检查点，人工审批为子任务 + 决定文档，详见 `docs/m0-findings.md` T0.8。
- 叶子求值器：结构化规则 `evaluator.kind = code | decisionTable`，非结构化规则 `semantic`（Jev）。同一规则可以配两种实现做对照（B7）。
- Coordinator 拥有订单版本和整单聚合层（R08、R37–R40），通过 A2A / native 接口获取各模块结果；依赖调度是确定性状态机。
- 业务服务暴露原生 HTTP 任务接口；`a2a-adapter` 在其上包一层 A2A server（B4 对照）。
- 人工任务由所属模块持有（状态机复用 `packages` 中的实现）；跨模块等待通过 A2A `input-required` 表达。Web 汇总各模块任务队列。角色身份由请求头 `x-demo-role` 模拟，服务端校验权限。
- 放行：调度员确认时在同一 SQLite 事务内重读当前版本、重新求值 R40，通过才写 DISPATCHED。

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
| 循环/反复崩溃 | 预算守卫 + 重启上限，超限转人工 |
| 可追溯 | 每个 run、tool、model 调用发出 `observability` 事件 |

每一行在 `docs/runtime-controls.md` 对应一个证据测试或故障场景。

## 8. 模型适配

```ts
interface SemanticJudge {
  ask(question: SemanticQuestion, state: SemanticState): Promise<SemanticAnswer>
}
```

实现：`JevJudge`（官方 SDK，`jev-1.14.0`）、`StructuredOutputJudge`（pi-ai NVIDIA `nemotron-3.5-lightning-30b-a3b`，强制调用 `submit_answer` 工具并按 schema 校验）、`ScriptedJudge`（按 questionId + 输入哈希回放，无精确匹配时用该问题的默认条目）。三者都关闭 SDK 自带重试，由 harness 统一重试。`SemanticAnswer` 保留 provider 原始字段和业务映射结果。

## 9. 可观测性

### 9.1 两级图视图（Console）

同一个图组件（`@xyflow/react` 12.12.0 + `elkjs` 0.12.0 自动分层布局）用于两个层级，交互一致：点节点看摘要，双击 zoom in，面包屑返回。

| 层级 | 节点 | 连线 | 节点卡片（不展开内部细节） |
|---|---|---|---|
| Overview（agent 级） | 每个 Durable Jev Agent | A2A 协作关系：静态来自 Agent Card 声明的依赖，实时叠加 A2A Task 数与等待状态 | 名称、负责的业务流程、健康（运行/重启中/离线）、规则包版本与规则数（代码 / Jev 占比）、固定的模型版本、进行中案例数、待处理人工任务数（按角色）、最近错误、Agent Card 链接 |
| Agent 内部（规则级） | 规则、人工门槛（含审批链）、调查助手、指向其他 agent 的边界节点（如"→ 商务 agent R35"） | `dependsOn` | 规则 ID 与名称、求值方式（代码 / Jev / 人工）、所选案例下的状态与 blockedBy |
| 节点详情 | — | — | 规则结果、Jev 原始答案与业务映射、审批链进度、证据（即 T6.3 判断详情） |

- 选中某个案例时，两级视图都按该案例着色：Overview 显示这单在各 agent 的状态与 A2A 往来，内部视图显示规则状态。未选案例时，Overview 显示架构与汇总指标。
- 数据来源：Agent Card（静态）、各 agent 的 `GET /agent/summary`（service-kit 提供，`contracts` 定义 `AgentSummary`）、规则包配置（内部图）、观察库（A2A Task、事件）。

- 事件写各服务 outbox 表，`observability` 收集器汇入 `var/data/observability.sqlite`；Console 通过查询 API + SSE 读取。
- 标识约定按 PRD 15.2；跨服务通过 HTTP `traceparent` 传播。
- 业务正确性不依赖观察库。
