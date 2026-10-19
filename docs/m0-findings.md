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

复现：`pnpm --filter @durable-jev/spike-jev semantic-checks`。默认 recorded 模式（注入 `fetch` 返回一次真实调用录下的响应），不消耗额度；`MODEL_MODE=live` 且设置 `TYPESAFE_API_KEY` 时才真实调用。

场景：一次请求同时问 R18（检查备注的风险信号，Choice）和 R10（安全说明与声明是否一致，Noul）。

| 验证项 | 结果 |
|---|---|
| 官方 TS SDK | 有：`@typesafe-ai/sdk`，`TypeSafeClient.systemOne()`，答案类型由问题推断 |
| 接口 | `POST https://api.typesafe.ai/v1/systemone`，Bearer `TYPESAFE_API_KEY` |
| 版本锁定 | 可固定模型 ID `jev-1.14.0`（另有 `jev-1.13.0`），避免 `jev-latest` 别名 |
| 字段 | Choice：`choice`、`probabilities`、`confidence`；Noul：只有 `noul`（无 confidence），与 PRD 一致 |
| 用量 | 返回 `usage.input_tokens` 与 `usage.output_tokens`（实测 440 / 77）；官方定价按输入 token 计费（$0.042 / Mtok），输出 token 是否计费未从账单核实 |
| 无 key 运行 | 通过。SDK 支持注入 `fetch`，可做 recorded/scripted 模式 |
| 真实调用 | 通过（2026-10-19，6 次）。见下表 |
| 鉴权失败 | 错误 key 抛 `AuthenticationError`（401），可与业务 UNKNOWN 区分为 ERROR |

真实调用结果（同一输入连续 6 次，`jev-1.14.0`）：

| 问题 | 结果 | 稳定性 |
|---|---|---|
| R18 `packagingRisk`（Choice） | 6/6 为 `damaged_packaging`；概率 0.84–0.88，`cold_chain_risk` 0.12–0.16，`no_risk` 0；confidence 0.76–0.82 | 判定稳定，概率小幅波动 |
| R10 `documentMatchesDeclaration`（Noul） | 0.04–0.05（疫苗 vs 锂电池 SDS，正确判为不一致） | 稳定 |
| 延迟 | 224–319 ms（含 TLS 建连，单次请求两个问题） | |
| 用量 | 每次 input 440 / output 77 token | 确定 |

未验证：限流（429）行为、大批量问题的延迟、全量样本上的质量（留给 B1）。

### 对设计的影响

- `JevJudge` 直接使用官方 SDK；`ScriptedJudge` 通过注入 `fetch` 回放，走同一解析路径。
- 一次请求可批量问多个问题，同一订单的多个语义判断可以合并成一次调用。
- SDK 自带重试（默认 2 次，单次超时 10s）。为了让预算守卫准确计数，SDK 重试关掉（`maxRetries: 0`），由 harness 统一管理重试。
- 环境变量统一用官方名 `TYPESAFE_API_KEY`。
- 同一输入的概率/confidence 有小幅波动，回放与回归测试不能依赖 live 结果，必须走 `ScriptedJudge`；门槛判定应只依赖映射后的离散结论，阈值不要贴近观测到的波动区间。

## Trace 传播（OpenTelemetry API 1.9.1 / SDK 2.12.0）

复现：`pnpm --filter @durable-jev/spike-trace propagation`

| 验证项 | 结果 |
|---|---|
| 跨服务传播 | 通过。Coordinator 通过 `propagation.inject` 写入 W3C `traceparent`，Cargo Assurance `extract` 后的 span 与上游同 traceId，parent 为上游 span |
| 恢复后的新 trace | 通过。`run.resumed` 是新的根 span（新 traceId），用 span link 指向中断前的 span |
| 业务关联 | 通过。correlationId 作为 span 属性，跨两个 trace 保持一致 |

### 对设计的影响

- 只用 `@opentelemetry/api` + SDK 的手动传播，不用自动插桩，行为可预测。
- 观察库存 span 时同时存 links，Console 用 correlationId 和 links 串起新旧 trace。
- A2A 客户端可用 SDK 的 `CallInterceptor` 注入 `traceparent`，T5.1 验证。

## 版本锁定

| 依赖 | 版本 |
|---|---|
| Node | 22.22.0 |
| pnpm | 10.28.0 |
| TypeScript | 6.0.3 |
| `@earendil-works/pi-durable` / `pi-ai` / `chord` | 1.3.0 |
| `@a2a-js/sdk` | 1.3.0 |
| `@typesafe-ai/sdk` | 0.7.0，模型 `jev-1.14.0` |
| `@opentelemetry/api` | 1.9.1 |
| `@opentelemetry/sdk-trace-node` / `sdk-trace-base` | 2.12.0 |
| Express | 5.3.0 |

所有依赖以精确版本写入 `package.json`（`.npmrc` 中 `save-exact=true`），lockfile 已提交。

## 总结

| 依赖 | 可行性 | 主要限制 |
|---|---|---|
| Pi Durable | 可行 | Experimental；单进程占有存储；`callers` 与 `restartLimit` 尚未验证 |
| A2A SDK | 可行 | 不提供重试去重；只有 Express/gRPC 服务端适配 |
| Jev | 可行（已真实调用） | 概率有小幅波动；限流行为未验证 |
| OpenTelemetry | 可行 | 无 |

`pnpm spikes` 一次运行全部 spike。
