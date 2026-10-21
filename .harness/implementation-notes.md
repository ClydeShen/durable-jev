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
