# Implementation notes

只记录计划变动和与 spec / design / roadmap 不符、需要用户知道的 high level 信息。

| 日期 | 事项 | 影响 |
|---|---|---|
| 2026-10-19 | Jev 有官方 TS SDK `@typesafe-ai/sdk`（之前误判为没有），key 变量为 `TYPESAFE_API_KEY` | T0.5 无需自写客户端；真实调用待 key，T0.5 暂标进行中 |
| 2026-10-19 | 选定依赖当前最新：pi-durable 1.3.0、pi-ai 1.3.0、@a2a-js/sdk 1.3.0 | P0 验证后锁定 |
| 2026-10-19 | TypeScript 选 6.0.3 而非最新 7.x（原生编译器），避免 `tsc -b` project references 兼容风险 | 无功能影响 |
| 2026-10-19 | HTTP 框架由 Fastify 改为 Express 5：A2A SDK 服务端只有 Express 适配器，统一框架更简单 | design 已更新 |
| 2026-10-19 | A2A SDK 不按 messageId 去重，F04 幂等需本项目自行实现映射 | 在 T5.1 范围内，无额外任务 |
| 2026-10-19 | 生成式模型改为 NVIDIA（pi-ai 内置 provider），现阶段只接 Jev；NVIDIA key 到位前 B1 对照组与调查 Agent 用脚本化模型 | T4.2 的 StructuredOutputJudge 与 B1/B2 真实模型部分顺延 |
| 2026-10-19 | Jev 真实调用通过；响应含 `output_tokens`（非 0），与"只按输入计费"的文档需在 B1 成本统计时核实 | T7.1 成本口径 |
| 2026-10-19 | RuleDefinition 增加 `parameters` 字段，配置校验据此检查缺失的 policy 参数 | design 5.2 已更新 |
| 2026-10-19 | 人工任务状态机放入新包 `packages/human-tasks`（纯函数），不放进 Coordinator，便于 P1 单测与后续服务复用 | design 目录已更新 |
| 2026-10-19 | Pi Durable 1.3.0 无 `restartLimit`/`retryTask`，`callers` 不区分人工；崩溃上限由 RunBudgetGuard 实现 | T4.4 范围增加重启上限 |
| 2026-10-19 | Jev 官方限制（位置偏差、注入、无关信息降准、算术不可靠）写入 m0-findings 与 design 8 | B1 增加选项打乱变体 |
| 2026-10-19 | R39 拆成 `R39-LOAD` + `R39-CONFIRM` 两个单角色人工门槛 | design 6 已更新 |
| 2026-10-19 | T2.1 规则子集中 R36 暂为 R31 AND R32、R25 暂不依赖 R16、R37 只聚合基础货件检查；T3.1 补全 | 仅影响 P2 纵切面 |
| 2026-10-19 | T2.2 完成标准调整：`demo:reset` 需要 Coordinator 库表，载入逻辑随 T2.3/T2.4 接入；T2.2 只交付经校验的种子与案例 | 无范围变化 |
| 2026-10-19 | 组合规则不再把子项的 WAITING_HUMAN 原样上传，改为 BLOCKED_DEPENDENCY；只有人工门槛本身显示等待人工（用户指出的现实常识） | design 5.3 已更新 |
| 2026-10-19 | 新增 T1.8 统一状态机（用户要求状态机一致）。发现两处真问题：已发运订单会被重新求值覆盖；改派后已批准任务不转 SUPERSEDED | design 10 新增 |
| 2026-10-19 | 发现 `escalateToHuman` 只把状态设为 WAITING_HUMAN 却不建任务，订单会卡死；改为必须配置复核角色并创建任务 | design 5.3.1、5.4 |
| 2026-10-19 | T3.1 引入条件规则（PASS / NOT_APPLICABLE）与拆分人工门槛，规则数多于 40 条但 R01–R40 编号保持 PRD 含义 | design 5.3.1 |
| 2026-10-19 | T3.1：40 条规则 + 10 条条件规则/拆分门槛，共 50 条；`policy-v1.md` 由 rules.json 生成并有一致性测试。用户规则图中 R35 类型与 R40 直接依赖按 PRD 处理（R35 拆为 R35-REQUIRED + R35；R40 直接依赖 R08、R30、R36–R39） | 无 |
| 2026-10-19 | 人工任务目标指纹目前包含全部 entityVersions，报价变化也会让合规签核失效，与"无关变更不失效"不符；T3.4 改为只取规则 invalidationTriggers 对应的实体版本 | T3.4 |
| 2026-10-20 | 放行事务改为"先远程求值、事务内校验版本后提交"的乐观并发，因为跨服务调用无法放进 SQLite 同步事务；语义不变（提交时版本必须仍是求值时的版本） | design 6.1 |
| 2026-10-20 | T3.2：分支服务不可用时订单转 TECHNICAL_FAILURE，并提供 `POST /cases/:id/reevaluate` 与工作台按钮恢复（PRD F05"明确技术状态"） | design 6.1 |
| 2026-10-20 | T3.4：变更后各服务仍完整重算自己的分支（确定性、便宜），失效集只决定"哪些结果标为 INVALIDATED / 变更后重新检查"。live 模式下 Jev 调用需按输入指纹缓存，避免无关变更重复调用（T4.1/T4.2） | T4.1、T4.2 |
| 2026-10-20 | T3.4 完成标准中的 LOG-004 失效集断言随 T3.5 的 LOG-004 案例补上；当前以等价场景测试（换车、换承运商、改报价）覆盖 | T3.5 |
