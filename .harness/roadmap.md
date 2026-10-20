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
| [x] | T1.2 | `rule-engine` 表达式与组合器（design 5.3） | 组合语义测试：UNKNOWN 不经 OR/NOT 变 PASS，空集合为 UNKNOWN | T1.1 |
| [x] | T1.3 | 配置校验：缺引用、类型、环、缺参数 | 对应 F16 测试 | T1.2 |
| [x] | T1.4 | 图求值：作用域展开（cargoItem/leg）、blockedBy、appliesWhen | 多货件一件失败整单不过（F17） | T1.2 |
| [x] | T1.5 | 指纹与失效传播、增量重算 | 改车辆只失效预期集合 | T1.4 |
| [x] | T1.6 | `store`：SQLite 连接、迁移、幂等操作表、outbox | 同一 operationId 重复执行只写一条 | T0.1 |
| [x] | T1.7 | 人工任务状态机：批准/拒绝/完成/过期/取消/替代，角色校验，版本绑定 | 未授权、过期、旧版本不能生效（F11、F12） | T1.1 |
| [x] | T1.8 | 统一状态机：订单、人工任务、预订用同一 `defineStateMachine`，终态不可变 | 非法转移被拒；已发运订单不被重新求值覆盖；改派后已批准任务转 SUPERSEDED | T1.7, T2.3 |

## P2 纵切面：LOG-001 端到端

| 状态 | ID | 任务 | 完成标准 | 依赖 |
|---|---|---|---|---|
| [x] | T2.1 | `eval/materials`：policy 参数、LOG-001 所需规则子集的 rules.json | 通过配置校验 | T1.3 |
| [x] | T2.2 | mock-data 种子：承运商、车辆、客户授信、LOG-001 订单 | 种子与案例通过 schema 与交叉引用校验；`demo:reset` 载入随 T2.4 接入 | T1.6 |
| [x] | T2.3 | `coordinator`：提交、求值、查询 checks、人工任务、放行事务 | API 跑通 LOG-001 | T1.4–T1.7, T2.1 |
| [x] | T2.4 | `service-kit` + `tools/launcher`：`pnpm start`、`pnpm demo:reset` | 一条命令起全部进程 | T2.3 |
| [x] | T2.5 | `web` 最小版：案例列表、规则树（状态、blockedBy）、按角色处理人工任务、调度确认 | 浏览器内完成 LOG-001 发运 | T2.3 |
| [x] | T2.6 | `docs/getting-started.md` | 新环境照做可演示 | T2.4, T2.5 |

## P3 完整规则与业务服务

| 状态 | ID | 任务 | 完成标准 | 依赖 |
|---|---|---|---|---|
| [x] | T3.1 | 补全 R09–R28、R33–R36 与决策表（混装矩阵、中转能力） | 全部 40 条通过配置校验 | T2.1 |
| [x] | T3.2 | 拆出 cargo-assurance、transport-planning、commercial-control，原生 HTTP 任务接口 | 各自 SQLite，launcher 启动 | T2.4 |
| [x] | T3.3 | Coordinator 并行调度分支；等待人工时无依赖分支继续 | 合规等待期间商务分支完成 | T3.2 |
| [x] | T3.4 | 变更：改车辆/路线/报价触发失效，UI 显示"哪次变更导致失效" | LOG-004 失效集符合预期 | T1.5, T3.3 |
| [x] | T3.5 | LOG-002–008 案例、事件脚本、draft 标注 | 文件齐全，标 `reviewStatus: draft` | T3.1 |
| [x] | T3.6 | 回放 runner（固定 workflow 基线），按阶段断言 | 8 个演示订单阶段断言通过 | T3.5 |

## P4 模型适配与 runtime harness

| 状态 | ID | 任务 | 完成标准 | 依赖 |
|---|---|---|---|---|
| [x] | T4.1 | `model-providers`：SemanticJudge 接口 + ScriptedJudge | 回放稳定 | T1.1 |
| [~] | T4.2 | JevJudge、StructuredOutputJudge（live 模式）；JevJudge 已完成，StructuredOutputJudge 待 NVIDIA key | 有 key 时同一问题两种 provider 均可答 | T0.5, T4.1 |
| [x] | T4.3 | 接入语义规则 R03、R10、R18、R27；observedValue 与 gateStatus 分开 | LOG-002、LOG-003 语义节点正确 | T4.1, T3.1 |
| [x] | T4.4 | `agent-harness`：接口、ToolRegistry、RunBudgetGuard（含重启上限）、ContextAssembler | 预算、重启上限与白名单测试 | T1.6 |
| [x] | T4.5 | InMemoryAgentRuntime + 脚本化模型 | 一次调查跑完 | T4.4 |
| [x] | T4.6 | transport-planning 调查 Agent：查候选、提议改派、提交结果 | LOG-004 改派建议，计划员确认后重算 | T4.5, T3.4 |
| [x] | T4.7 | PiDurableAgentRuntime | 同一调查杀进程后恢复 | T0.3, T4.5 |
| [x] | T4.8 | `docs/runtime-controls.md`：每个控制点链接证据 | 每行有测试或故障场景 | T4.4–T4.7 |

## P5 A2A、持久化与故障

| 状态 | ID | 任务 | 完成标准 | 依赖 |
|---|---|---|---|---|
| [x] | T5.1 | `a2a-adapter`：Agent Card、业务任务 ↔ A2A Task 映射表、终态后新建关联任务 | 能力发现与任务查询 | T0.4, T3.2 |
| [x] | T5.2 | Coordinator 可切换 native / A2A 调用 | 切换后业务代码无改动（H4） | T5.1 |
| [x] | T5.3 | 故障 runner：F01–F10 | `pnpm faults` 出报告 | T4.7, T5.2 |
| [x] | T5.4 | F11–F18 | 同上 | T5.3 |
| [x] | T5.5 | Web 演示控制：杀/重启服务、注入超时、重复提交 | LOG-006 可在浏览器演示 | T5.3 |
| [x] | T5.6 | 阶段 live 抽测：真实 Jev 跑全部案例（经 A2A 路径），记录并转成改进 | `docs/live-checks.md` 有 P5 条目，发现已转任务 | T5.2 |

## P6 可观测性与 Console

| 状态 | ID | 任务 | 完成标准 | 依赖 |
|---|---|---|---|---|
| [x] | T6.1 | 事件 schema、各服务 outbox、收集器 | 事件汇入观察库 | T1.6 |
| [x] | T6.2 | trace 传播、重启后新 trace 用 span link 关联 | 同案例新旧 trace 可串起 | T0.6, T6.1 |
| [x] | T6.3 | Console：案例列表、时间线、调用树、判断详情、恢复详情 | 从规则节点跳到 Jev span / A2A Task / 人工证据 | T6.2 |
| [x] | T6.4 | SSE + 快照游标补齐 | 断线刷新不丢事件 | T6.3 |
| [x] | T6.5 | 阶段 live 抽测：真实 Jev 跑案例，在 Console 中核对 Jev span 与判断详情 | `docs/live-checks.md` 有 P6 条目 | T6.3 |

## P7 Benchmark 与结论

| 状态 | ID | 任务 | 完成标准 | 依赖 |
|---|---|---|---|---|
| [ ] | T7.0 | 落实此前 live 抽测的改进（如 R27 问法、阈值缓冲带），用真实 Jev 复测 | 复测结果记入 `docs/live-checks.md` | T5.6, T6.5 |
| [ ] | T7.1 | B1 Jev vs 结构化输出（即 P7 的 live 抽测） | 报告 macro-F1、成本、p95 | T4.2 |
| [ ] | T7.2 | B2 固定 workflow vs 动态 Agent | 完成率、无效调用率 | T3.6, T4.6 |
| [ ] | T7.3 | B3 in-memory vs Pi Durable | 恢复成功率、重复副作用 | T5.3 |
| [ ] | T7.4 | B4 native vs A2A | 开销与替换测试 | T5.2 |
| [~] | T7.5 | `docs/demo-guide.md`、`docs/report.md`：H1–H5 结论与组件建议 | 每条假设有证据 | T7.1–T7.4 |

## P8 规范统一与一键 Demo

| 状态 | ID | 任务 | 完成标准 | 依赖 |
|---|---|---|---|---|
| [x] | T8.1 | 写 `docs/conventions.md`（arrow function 能用就用、目录分层、`<概念>.<角色>.ts` 命名、术语表）并加 `pnpm check:conventions` 棘轮检查 | lint 包含该检查；基线只增不减 | - |
| [x] | T8.2 | Dashboard 场景导览：8 个案例与故障演示做成可点的场景，步骤随真实状态推进 | 全部场景不开终端即可演完 | T8.1 |
| [x] | T8.3 | 补缺失控件：换路线（LOG-007）、记录新包装（LOG-008）；故障按钮（Jev 不可用、并发改报价） | replay 里的每一步 UI 都能做 | T8.2 |
| [ ] | T8.4 | Dashboard 内切换 native/A2A 与 scripted/live；证明页显示 replay 与 faults 结果并可重跑 | 无需改环境变量或敲命令 | T8.2 |
| [ ] | T8.5 | 一键启动（bootstrap+start 合一，自动打开浏览器） | 一条命令进入 Dashboard | T8.2 |
| [ ] | T8.6 | 按包迁移到新规范（每包一组小 commit，每包迁完跑全套验证），基线清零 | `baseline.json` 为空 | T8.1 |
| [ ] | T8.7 | 重写 `docs/demo-guide.md`，只描述 Dashboard 内的操作 | 全程无命令 | T8.2–T8.5 |
