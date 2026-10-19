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
