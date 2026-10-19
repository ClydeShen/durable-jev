# M0 技术预检结论

每个 spike 可在本仓库复现。结论只针对锁定版本。

## Pi Durable 1.3.0

复现：`pnpm --filter @durable-jev/spike-pi-durable crash-recovery`（脚本化模型，无需 key）

场景：调查 agent 依次调用只读工具 `get_vehicle`、人工专属工具 `approve_compliance`、写工具 `reserve_transport`。写工具在业务账本落库后、结果提交前杀进程（对应 F02），再重启。

| 验证项 | 结果 |
|---|---|
| 重启后恢复同一任务 | 通过。同一 `requestId` 返回同一 submission，从检查点继续直到完成 |
| 已完成的只读工具不重跑 | 通过。结果从存储读出 |
| 写工具不重放 | 通过。未声明 `replay: "safe"` 的工具在重启后得到 `interrupted` 错误，不再执行 |
| 不确定状态的处理路径 | 通过。模型收到 `interrupted` 后调用 `get_operation_status` 核对为已生效；业务账本只有 1 条 |
| 人工专属工具拦截 | 通过。`beforeTool` hook 返回 block，模型得到 `blocked` 错误结果 |
| 用量记录 | 通过。`harness.usage()` 按 provider/model 汇总，含失败尝试 |
| 无 key 运行 | 通过。pi-ai 自带 faux provider，可脚本化模型响应 |

尚未验证：`callers` / `modelTools` 不向模型暴露工具、`restartLimit` 崩溃循环保护。

### 对设计的影响

- `replayPolicy: verifyByOperationId` 可直接映射为 Pi 的默认（非 replay-safe）行为，再配合业务端 `get_operation_status`。
- Pi 的 `requestId` 只保证"提交"幂等，业务副作用幂等仍由我们的 operationId 和业务库唯一约束负责。
- 人工专属工具优先"不注册给 agent"，hook 拦截作为第二道防线。
- faux provider 可作为 `ScriptedJudge` / 脚本化调查模型的底座。

### 限制

- API 标为 Experimental；版本锁定为 1.3.0。
- 一个存储只能被一个进程拥有，无跨进程锁。
- SQLite 存储依赖 Node 内置 `node:sqlite`（运行时打印 ExperimentalWarning）。
- 断电或主机故障可能丢最新一次提交（`synchronous = NORMAL`），与 PRD 只承诺进程崩溃恢复一致。

## A2A SDK `@a2a-js/sdk` 1.3.0（协议 v1.0）

复现：`pnpm --filter @durable-jev/spike-a2a round-trip`

场景：Cargo Assurance 以 A2A JSON-RPC 暴露能力；客户端发现 Agent Card、发起核验、收到 input-required、补充资料后取得结构化 Artifact。

| 验证项 | 结果 |
|---|---|
| 能力发现 | 通过。`ClientFactory.createFromUrl` 读取 `/.well-known/agent-card.json` |
| 任务查询 | 通过。`getTask` 返回同一任务状态 |
| 补资料映射 | 通过。`INPUT_REQUIRED` 携带缺失字段；带原 taskId 的后续消息使任务进入 `COMPLETED` |
| 结构化业务结果 | 通过。业务 checks 以 data part 放入 Artifact |
| 重复请求去重（F04） | **不提供**。相同 `messageId` 重发会新建任务并再次执行 |

### 对设计的影响

- F04 需要本项目在 `a2a-adapter` 中维护 `(caseId, revision, capability) → a2aTaskId` 映射，重试时返回原任务。
- SDK 服务端只提供 Express 适配器（另有 gRPC）。服务统一改用 Express 5，不再使用 Fastify。
- AgentInterface 必须声明 `protocolVersion: '1.0'`，否则服务端拒绝所有请求。
- 默认 `InMemoryTaskStore` 重启即丢；SDK 提供基于 Kysely 的 `DatabaseTaskStore`（SQLite 可用），T5.1 再决定是否采用。

## Jev `@typesafe-ai/sdk` 0.7.0

复现：`pnpm --filter @durable-jev/spike-jev semantic-checks`。未设置 `TYPESAFE_API_KEY` 时用 recorded 模式（注入 `fetch` 返回录制响应），设置后真实调用。

场景：一次请求同时问 R18（检查备注的风险信号，Choice）和 R10（安全说明与声明是否一致，Noul）。

| 验证项 | 结果 |
|---|---|
| 官方 TS SDK | 有：`@typesafe-ai/sdk`，`TypeSafeClient.systemOne()`，答案类型由问题推断 |
| 接口 | `POST https://api.typesafe.ai/v1/systemone`，Bearer `TYPESAFE_API_KEY` |
| 版本锁定 | 可固定模型 ID `jev-1.14.0`（另有 `jev-1.13.0`），避免 `jev-latest` 别名 |
| 字段 | Choice：`choice`、`probabilities`、`confidence`；Noul：只有 `noul`（无 confidence），与 PRD 一致 |
| 用量 | 返回 `usage.input_tokens`；按输入 token 计费（$0.042 / Mtok），输出免费 |
| 无 key 运行 | 通过。SDK 支持注入 `fetch`，可做 recorded/scripted 模式 |
| 真实调用 | **待 key**。质量、延迟、限流行为未验证 |

### 对设计的影响

- `JevJudge` 直接使用官方 SDK；`ScriptedJudge` 通过注入 `fetch` 回放，走同一解析路径。
- 一次请求可批量问多个问题，同一订单的多个语义判断可以合并成一次调用。
- SDK 自带重试（默认 2 次，单次超时 10s）。为了让预算守卫准确计数，SDK 重试关掉（`maxRetries: 0`），由 harness 统一管理重试。
- 环境变量统一用官方名 `TYPESAFE_API_KEY`。
