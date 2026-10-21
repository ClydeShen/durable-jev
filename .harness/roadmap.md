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
| [x] | T0.8 | spike：Pi Durable 承载一个模块级流程（确定性规则求值 + 等待人工 + 杀进程恢复），不经过 LLM 决定下一步 | 可行或明确不可行，结论写入 m0-findings 并回写 design | T0.3 |
| [x] | T0.7 | `docs/m0-findings.md` + 锁定版本 + 回写 design | 每个依赖：版本、可行性、限制、对设计的影响 | T0.3–T0.6 |

## P1 确定性核心

| 状态 | ID | 任务 | 完成标准 | 依赖 |
|---|---|---|---|---|
| [x] | T1.1 | `contracts`：ids、状态枚举、shipment、check、humanTask | 类型与 Zod schema 可导出 | T0.1 |
| [x] | T1.2 | `rule-engine` 表达式与组合器（design 5.3） | 组合语义测试：UNKNOWN 不经 OR/NOT 变 PASS，空集合为 UNKNOWN | T1.1 |
| [ ] | T1.3 | 配置校验：缺引用、类型、环、缺参数、混装矩阵矛盾；规则适用范围字段（目的地/货物类别/客户） | 对应 F16 测试 | T1.2 |
| [ ] | T1.4 | 图求值：作用域展开（cargoItem/leg）、blockedBy、appliesWhen | 多货件一件失败整单不过（F17） | T1.2 |
| [ ] | T1.5 | 指纹与失效传播、增量重算 | 改车辆只失效预期集合 | T1.4 |
| [ ] | T1.6 | `store`：SQLite 连接、迁移、幂等操作表、outbox | 同一 operationId 重复执行只写一条 | T0.1 |
| [ ] | T1.7 | 人工任务状态机（模块共用包）：批准/拒绝/完成/过期/取消/替代，角色校验，版本绑定；2–3 角色审批链（顺序/并行、四眼原则、条件步骤） | 未授权、过期、旧版本不能生效（F11、F12）；链中任一拒绝即 FAIL，同一人不能签两步 | T1.1 |

## P2 纵切面：LOG-001 端到端

| 状态 | ID | 任务 | 完成标准 | 依赖 |
|---|---|---|---|---|
| [ ] | T2.1 | `eval/materials`：policy 参数、LOG-001 所需规则子集的 rules.json | 通过配置校验 | T1.3 |
| [ ] | T2.2 | mock-data 种子：承运商、车辆、客户授信、LOG-001 订单 | `demo:reset` 可载入 | T1.6 |
| [ ] | T2.3 | `coordinator`：提交、求值、查询 checks、人工任务、放行事务（纵切面先单进程；人工任务在 T3.2 下放到模块） | API 跑通 LOG-001 | T1.4–T1.7, T2.1 |
| [ ] | T2.4 | `service-kit` + `tools/launcher`：`pnpm start`、`pnpm demo:reset` | 一条命令起全部进程 | T2.3 |
| [ ] | T2.5 | `web` 最小版：案例列表、规则图（共用图组件，design 9.1 内部视图；状态、blockedBy）、按角色处理人工任务、调度确认 | 浏览器内完成 LOG-001 发运 | T2.3 |
| [ ] | T2.6 | `docs/getting-started.md` | 新环境照做可演示 | T2.4, T2.5 |

## P3 完整规则与业务服务

| 状态 | ID | 任务 | 完成标准 | 依赖 |
|---|---|---|---|---|
| [ ] | T3.0 | 规则编写 agent：`policy-v1.md` → 规则图配置、结构化表达式、Jev 问题；输出待人工审核的 diff | 由政策原文生成 LOG-001 规则子集并与 T2.1 手写版一致 | T1.3, T4.2 |
| [ ] | T3.1 | 用编写 agent 补全 R09–R28、R33–R36 与决策表（混装矩阵、中转能力），人工审核 | 全部 40 条通过配置校验；记录生成与审核耗时、人工修改量 | T2.1, T3.0 |
| [ ] | T3.2 | 拆出货物合规、运输计划、商务三个 Durable Jev Agent（design 2），各自持有规则图与人工任务，原生 HTTP 任务接口，`GET /agent/summary` | 各自 SQLite，launcher 启动 | T2.4 |
| [ ] | T3.2a | agent 间点对点协作：运输 → 商务（R35 额外费用审批）、运输 → 货物（R28 候选计划复核）、换承运商通知货物 agent 使 R13 审批链失效 | LOG-004 中三种往来均出现 | T3.2 |
| [ ] | T3.3 | Coordinator 并行调度分支；等待人工时无依赖分支继续 | 合规等待期间商务分支完成 | T3.2 |
| [ ] | T3.4 | 变更：改车辆/路线/报价触发失效，UI 显示"哪次变更导致失效" | LOG-004 失效集符合预期 | T1.5, T3.3 |
| [ ] | T3.5 | LOG-002–008 案例、事件脚本、draft 标注 | 文件齐全，标 `reviewStatus: draft` | T3.1 |
| [ ] | T3.7 | 扩展包：`policy-v1.md` 附录（客户合同条款、目的地进口要求，仿 MPI IHS 结构），编写 agent 生成 100–200 条扩展规则（`CUST-*`、`DEST-*`），挂到 R27 与新增 R41（汇入 R37）；LOG-001–008 补目的地与客户；20–30 份筛选样本（draft） | 扩展规则通过配置校验；每单命中少数几条 | T3.0, T3.1 |
| [ ] | T3.8 | 适用规则筛选：Jev 分类订单（货物类别、目的地要求组）+ 索引取规则；不确定时多选或转人工 | 筛选样本零漏选；UI 显示"已筛掉 N 条" | T3.7, T4.2 |
| [ ] | T3.6 | 回放 runner（固定 workflow 基线），按阶段断言 | 8 个演示订单阶段断言通过 | T3.5 |

## P4 模型适配与 runtime harness

| 状态 | ID | 任务 | 完成标准 | 依赖 |
|---|---|---|---|---|
| [x] | T4.1 | `model-providers`：SemanticJudge 接口 + ScriptedJudge | 回放稳定 | T1.1 |
| [x] | T4.2 | JevJudge、StructuredOutputJudge（live 模式） | 有 key 时同一问题两种 provider 均可答 | T0.5, T4.1 |
| [ ] | T4.3 | 接入语义规则 R03、R10、R18、R27；observedValue 与 gateStatus 分开 | LOG-002、LOG-003 语义节点正确 | T4.1, T3.1 |
| [ ] | T4.4 | `agent-harness`：接口、ToolRegistry、RunBudgetGuard、ContextAssembler | 预算与白名单测试 | T1.6 |
| [ ] | T4.5 | InMemoryAgentRuntime + 脚本化模型 | 一次调查跑完 | T4.4 |
| [ ] | T4.6 | 运输计划 agent 的调查助手：查候选、提议改派、提交结果 | LOG-004 改派建议，计划员确认后重算 | T4.5, T3.4 |
| [ ] | T4.7 | PiDurableAgentRuntime；按 T0.8 结论扩展到模块级流程 | 同一调查、同一模块等待人工时杀进程后恢复 | T0.8, T4.5 |
| [ ] | T4.8 | `docs/runtime-controls.md`：每个控制点链接证据 | 每行有测试或故障场景 | T4.4–T4.7 |

## P5 A2A、持久化与故障

| 状态 | ID | 任务 | 完成标准 | 依赖 |
|---|---|---|---|---|
| [ ] | T5.1 | `a2a-adapter`：Agent Card、业务任务 ↔ A2A Task 映射表、终态后新建关联任务 | 能力发现与任务查询 | T0.4, T3.2 |
| [ ] | T5.2 | Coordinator 可切换 native / A2A 调用 | 切换后业务代码无改动（H4） | T5.1 |
| [ ] | T5.2a | 目的地合规 agent：用 agent 模板新增第 5 个 agent，经 Agent Card 被发现，R40 加一个依赖 | 已有 4 个 agent 零代码改动；作为扩展演示脚本 | T3.7, T5.1 |
| [ ] | T5.3 | 故障 runner：F01–F10 | `pnpm faults` 出报告 | T4.7, T5.2 |
| [ ] | T5.4 | F11–F18 | 同上 | T5.3 |
| [ ] | T5.5 | Web 演示控制：杀/重启服务、注入超时、重复提交 | LOG-006 可在浏览器演示 | T5.3 |

## P6 可观测性与 Console

| 状态 | ID | 任务 | 完成标准 | 依赖 |
|---|---|---|---|---|
| [ ] | T6.1 | 事件 schema、各服务 outbox、收集器 | 事件汇入观察库 | T1.6 |
| [ ] | T6.2 | trace 传播、重启后新 trace 用 span link 关联 | 同案例新旧 trace 可串起 | T0.6, T6.1 |
| [ ] | T6.3 | Console：案例列表、时间线、调用树、判断详情、恢复详情 | 从规则节点跳到 Jev span / A2A Task / 人工证据 | T6.2 |
| [ ] | T6.3a | Overview：agent 级图（design 9.1），节点卡片基础信息，A2A 关系与实时叠加；双击进入 agent 内部规则图 | 一屏看清 5 个 agent 状态；选中案例后显示其 A2A 往来 | T6.3, T5.2a |
| [ ] | T6.4 | SSE + 快照游标补齐 | 断线刷新不丢事件 | T6.3 |

## P7 Benchmark 与结论

| 状态 | ID | 任务 | 完成标准 | 依赖 |
|---|---|---|---|---|
| [ ] | T7.1 | B1 Jev vs 结构化输出 | 报告 macro-F1、成本、p95 | T4.2 |
| [ ] | T7.2 | B2 固定 workflow vs 动态 Agent | 完成率、无效调用率 | T3.6, T4.6 |
| [ ] | T7.3 | B3 in-memory vs Pi Durable | 恢复成功率、重复副作用 | T5.3 |
| [ ] | T7.4 | B4 native vs A2A | 开销与替换测试 | T5.2 |
| [ ] | T7.6 | B7 Durable Jev Agent 成本：手写代码占比、Jev/编写 agent 承担的规则占比、现场政策变更耗时、单条规则实现成本、筛选正确率与漏选率、扩展规则中 Jev 占比；附规则分界图 | CEO 版指标表；错误放行单列且为 0 | T3.1, T4.3 |
| [ ] | T7.7 | `docs/agent-architecture.md`（技术 CEO 视角） | 每节链接到实现与证据 | T5.2a, T6.3a |
| [ ] | T7.5 | `docs/demo-guide.md`、`docs/report.md`：H1–H5 与 Durable Jev Agent 结论、组件建议 | 每条假设有证据 | T7.1–T7.4, T7.6 |
