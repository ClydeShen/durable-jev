# Roadmap

状态：`[ ]` 未开始，`[~]` 进行中，`[x]` 完成，`[-]` 取消（原因记入 implementation-notes）。

每个阶段结束时都有可演示的东西。P2 结束即有端到端纵切面。

## P0 骨架与技术预检（PRD M0）

| 状态 | ID | 任务 | 完成标准 | 依赖 |
|---|---|---|---|---|
| [x] | T0.1 | monorepo 骨架：pnpm workspace、tsconfig base、Biome、Vitest、`.gitignore`、`.env.example` | `pnpm install && pnpm build && pnpm test` 在空包上通过 | |
| [x] | T0.2 | 根脚本 `bootstrap/start/test` 占位，`README.md` 指向 `docs/getting-started.md` | 命令可执行 | T0.1 |
| [x] | T0.3 | spike pi-durable：只读工具 + 写工具，杀进程后恢复；观察 replay policy、callers、requestId、restartLimit | 脚本可复现，结论写入 m0-findings | T0.1 |
| [x] | T0.4 | spike A2A：Agent Card、发送任务、查询任务、input-required | 两进程间往返成功 | T0.1 |
| [x] | T0.5 | spike Jev：确定 TS 客户端或 HTTP 接口；Choice 与 Noul 各一次 | 有 key 时真实调用；无 key 时记录接口形状 | T0.1 |
| [x] | T0.6 | spike trace：两个 Express 之间 traceparent 传播 | 下游日志带上游 traceId | T0.1 |
| [x] | T0.7 | `docs/m0-findings.md` + 锁定版本 + 回写 design | 每个依赖：版本、可行性、限制、对设计的影响 | T0.3–T0.6 |

## P1 确定性核心

| 状态 | ID | 任务 | 完成标准 | 依赖 |
|---|---|---|---|---|
| [x] | T1.1 | `contracts`：ids、状态枚举、shipment、check、humanTask | 类型与 Zod schema 可导出 | T0.1 |
| [ ] | T1.2 | `rule-engine` 表达式与组合器（design 5.3） | 组合语义测试：UNKNOWN 不经 OR/NOT 变 PASS，空集合为 UNKNOWN | T1.1 |
| [ ] | T1.3 | 配置校验：缺引用、类型、环、缺参数 | 对应 F16 测试 | T1.2 |
| [ ] | T1.4 | 图求值：作用域展开（cargoItem/leg）、blockedBy、appliesWhen | 多货件一件失败整单不过（F17） | T1.2 |
| [ ] | T1.5 | 指纹与失效传播、增量重算 | 改车辆只失效预期集合 | T1.4 |
| [ ] | T1.6 | `store`：SQLite 连接、迁移、幂等操作表、outbox | 同一 operationId 重复执行只写一条 | T0.1 |
| [ ] | T1.7 | 人工任务状态机：批准/拒绝/完成/过期/取消/替代，角色校验，版本绑定 | 未授权、过期、旧版本不能生效（F11、F12） | T1.1 |

## P2 纵切面：LOG-001 端到端

| 状态 | ID | 任务 | 完成标准 | 依赖 |
|---|---|---|---|---|
| [ ] | T2.1 | `eval/materials`：policy 参数、LOG-001 所需规则子集的 rules.json | 通过配置校验 | T1.3 |
| [ ] | T2.2 | mock-data 种子：承运商、车辆、客户授信、LOG-001 订单 | `demo:reset` 可载入 | T1.6 |
| [ ] | T2.3 | `coordinator`：提交、求值、查询 checks、人工任务、放行事务 | API 跑通 LOG-001 | T1.4–T1.7, T2.1 |
| [ ] | T2.4 | `service-kit` + `tools/launcher`：`pnpm start`、`pnpm demo:reset` | 一条命令起全部进程 | T2.3 |
| [ ] | T2.5 | `web` 最小版：案例列表、规则树（状态、blockedBy）、按角色处理人工任务、调度确认 | 浏览器内完成 LOG-001 发运 | T2.3 |
| [ ] | T2.6 | `docs/getting-started.md` | 新环境照做可演示 | T2.4, T2.5 |

## P3 完整规则与业务服务

| 状态 | ID | 任务 | 完成标准 | 依赖 |
|---|---|---|---|---|
| [ ] | T3.1 | 补全 R09–R28、R33–R36 与决策表（混装矩阵、中转能力） | 全部 40 条通过配置校验 | T2.1 |
| [ ] | T3.2 | 拆出 cargo-assurance、transport-planning、commercial-control，原生 HTTP 任务接口 | 各自 SQLite，launcher 启动 | T2.4 |
| [ ] | T3.3 | Coordinator 并行调度分支；等待人工时无依赖分支继续 | 合规等待期间商务分支完成 | T3.2 |
| [ ] | T3.4 | 变更：改车辆/路线/报价触发失效，UI 显示"哪次变更导致失效" | LOG-004 失效集符合预期 | T1.5, T3.3 |
| [ ] | T3.5 | LOG-002–008 案例、事件脚本、draft 标注 | 文件齐全，标 `reviewStatus: draft` | T3.1 |
| [ ] | T3.6 | 回放 runner（固定 workflow 基线），按阶段断言 | 8 个演示订单阶段断言通过 | T3.5 |

## P4 模型适配与 runtime harness

| 状态 | ID | 任务 | 完成标准 | 依赖 |
|---|---|---|---|---|
| [ ] | T4.1 | `model-providers`：SemanticJudge 接口 + ScriptedJudge | 回放稳定 | T1.1 |
| [ ] | T4.2 | JevJudge、StructuredOutputJudge（live 模式） | 有 key 时同一问题两种 provider 均可答 | T0.5, T4.1 |
| [ ] | T4.3 | 接入语义规则 R03、R10、R18、R27；observedValue 与 gateStatus 分开 | LOG-002、LOG-003 语义节点正确 | T4.1, T3.1 |
| [ ] | T4.4 | `agent-harness`：接口、ToolRegistry、RunBudgetGuard、ContextAssembler | 预算与白名单测试 | T1.6 |
| [ ] | T4.5 | InMemoryAgentRuntime + 脚本化模型 | 一次调查跑完 | T4.4 |
| [ ] | T4.6 | transport-planning 调查 Agent：查候选、提议改派、提交结果 | LOG-004 改派建议，计划员确认后重算 | T4.5, T3.4 |
| [ ] | T4.7 | PiDurableAgentRuntime | 同一调查杀进程后恢复 | T0.3, T4.5 |
| [ ] | T4.8 | `docs/runtime-controls.md`：每个控制点链接证据 | 每行有测试或故障场景 | T4.4–T4.7 |

## P5 A2A、持久化与故障

| 状态 | ID | 任务 | 完成标准 | 依赖 |
|---|---|---|---|---|
| [ ] | T5.1 | `a2a-adapter`：Agent Card、业务任务 ↔ A2A Task 映射表、终态后新建关联任务 | 能力发现与任务查询 | T0.4, T3.2 |
| [ ] | T5.2 | Coordinator 可切换 native / A2A 调用 | 切换后业务代码无改动（H4） | T5.1 |
| [ ] | T5.3 | 故障 runner：F01–F10 | `pnpm faults` 出报告 | T4.7, T5.2 |
| [ ] | T5.4 | F11–F18 | 同上 | T5.3 |
| [ ] | T5.5 | Web 演示控制：杀/重启服务、注入超时、重复提交 | LOG-006 可在浏览器演示 | T5.3 |

## P6 可观测性与 Console

| 状态 | ID | 任务 | 完成标准 | 依赖 |
|---|---|---|---|---|
| [ ] | T6.1 | 事件 schema、各服务 outbox、收集器 | 事件汇入观察库 | T1.6 |
| [ ] | T6.2 | trace 传播、重启后新 trace 用 span link 关联 | 同案例新旧 trace 可串起 | T0.6, T6.1 |
| [ ] | T6.3 | Console：案例列表、时间线、调用树、判断详情、恢复详情 | 从规则节点跳到 Jev span / A2A Task / 人工证据 | T6.2 |
| [ ] | T6.4 | SSE + 快照游标补齐 | 断线刷新不丢事件 | T6.3 |

## P7 Benchmark 与结论

| 状态 | ID | 任务 | 完成标准 | 依赖 |
|---|---|---|---|---|
| [ ] | T7.1 | B1 Jev vs 结构化输出 | 报告 macro-F1、成本、p95 | T4.2 |
| [ ] | T7.2 | B2 固定 workflow vs 动态 Agent | 完成率、无效调用率 | T3.6, T4.6 |
| [ ] | T7.3 | B3 in-memory vs Pi Durable | 恢复成功率、重复副作用 | T5.3 |
| [ ] | T7.4 | B4 native vs A2A | 开销与替换测试 | T5.2 |
| [ ] | T7.5 | `docs/demo-guide.md`、`docs/report.md`：H1–H5 结论与组件建议 | 每条假设有证据 | T7.1–T7.4 |
