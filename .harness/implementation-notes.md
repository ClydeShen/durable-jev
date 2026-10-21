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
| 2026-10-21 | Jev 与 NVIDIA key 到位，T0.5 真实调用通过；T4.1/T4.2 先于 P1–P3 完成 | 语义问题/答案类型暂放在 `model-providers`，T1.1 不再重复定义 |
| 2026-10-21 | NVIDIA Nemotron 在 pi-ai 中不支持 strict JSON schema；StructuredOutputJudge 用强制 tool call + 本地 schema 校验，非法输出直接报错 | B1 需统计结构化输出的格式失败率 |
| 2026-10-21 | pi-ai 目录中 NVIDIA 模型价格为 0（非 provider 实报），Jev 实际也返回 `output_tokens` | B1 成本按 token 数另行计价，不直接用 catalog cost |
| 2026-10-21 | 评估把 Protégé/本体加入技术栈（本体+Jev vs 代码+Jev）：不做。限定 Node、不加 Java 后无成熟 OWL DL 推理，剩下的 RDF 规则/SHACL 与 JSON 决策表等价；规则规模小，收益不抵成本 | 无。保留其中有用的部分：类别与 Jev 标签单一来源（T3.1/T4.3），兼容矩阵矛盾检测（T1.3） |
| 2026-10-21 | 明确核心概念 Durable Jev Agent（spec 8）：模块 = Jev + Pi Durable + 规则图 + 人工门槛，A2A 协作；结构化规则仍用代码。人工任务从 Coordinator 下放到模块 | 改 design 6、roadmap T1.7/T2.3/T3.2/T4.7；新增 T0.8 spike 与 T7.6（B7） |
| 2026-10-21 | 方向澄清：尽可能让 agent 做，目标是"小团队 + Durable Jev Agent 替代大团队多年开发的规则引擎"。新增规则编写 agent（T3.0），T3.1 改为生成 + 审核；B7 改为面向 CEO 的成本指标。业务场景与已完成部分不变 | roadmap T3.0/T3.1/T7.6 |
| 2026-10-21 | 人工审批支持 2–3 个角色的审批链（顺序/并行、四眼原则、条件追加步骤） | contracts humanTask 增加 `approvalChain`；design 5.2/5.5；T1.7 范围扩大；T2.1/T3.1 政策中为 R13、R20、R34 等设计审批链 |
| 2026-10-21 | 加入扩展包（agent 生成 100–200 条附录规则）与适用规则筛选；规则 ID 放宽为 `R\d{2}` 或 `CUST-*`/`DEST-*` 形式；新增 R41 目的地进口要求聚合 | roadmap T1.3/T3.7/T3.8/T7.6 |
| 2026-10-21 | agent 清单定为订单协调/货物合规/运输计划/商务 + 目的地合规（扩展演示）；"agent" 只指 Durable Jev Agent，LLM 循环称调查助手；加点对点协作；Console 增加 agent 级 Overview，与规则级视图共用图组件 | design 2/6/9.1；roadmap T2.5/T3.2/T3.2a/T5.2a/T6.3a/T7.7 |
