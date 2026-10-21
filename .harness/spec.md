# Spec：对齐后的范围

基线是 `prd.md`（v0.3）。本文件记录与用户对齐后的决定，冲突时以本文件为准。

## 1. 交付方式

- 分阶段交付，先快速成型：尽早有一条端到端可演示的纵切面，再逐步加深。
- 小 commit；只写轻量 unit test，不要求 coverage。
- 代码自解释：有意义的命名，避免注释。
- 一键编译、一键启动；简单操作即可演示和验证 PRD 的关键内容。
- 不依赖 key 也能完整演示：模型调用支持 `scripted` 回放模式；用户自行获取 key 后切到 `live`。

## 2. 目录职责

- `.harness/`：agent 实施用的 source of truth，agent 自治。
- `docs/`：给用户看的文档（启动说明、演示指南、runtime-controls、M0 结论、最终报告）。
- `eval/`：测试物料、标准答案、故障场景、benchmark runner。

## 3. Runtime harness 是一条设计主线

目的：评审问"agent 运行时如何保证安全和受控"时，能指出 runtime harness 以及每个控制点的落点和证据。

- 控制都在模型之外，由确定性代码执行；模型只提出下一步，没有权限。
- `packages/agent-harness` 把控制点作为接口的一等公民，不绑死 Pi Durable。
- `docs/runtime-controls.md` 列出每个控制点：手段、落点、来源（Pi 提供 / 本项目实现）、PRD 对应、证据（测试或故障实验）。
- 不夸大 Pi 的能力：P0 未验证的能力不写成"Pi 提供"。

## 4. 范围裁剪（第一轮）

先不做，后续视情况追加：

- B5（与其他 durable 框架比较）。
- B6 的 100 条规则性能分层。
- Console 的"实验比较"页（benchmark 结果先以报告文件输出）。
- 全量 90 + 18 样本。第一轮只做 LOG-001 ~ LOG-008 和每个场景家族少量开发样本。

## 5. 标注

标准答案由 agent 出候选，用户审定后才算数。未审定的标注在文件中标记 `reviewStatus: draft`，基于它的结果不得作为结论证据。

## 6. 外部依赖与凭据

用户负责获取 Jev 和生成式模型的 key。未提供 key 时，相关 spike 只验证接口形状，并在 `docs/m0-findings.md` 如实记录。

## 7. 模型选择（2026-10-19）

- 现阶段只接 Jev（`TYPESAFE_API_KEY`，模型 `jev-1.14.0`）。
- 生成式模型选定 NVIDIA（pi-ai 内置 provider，`NVIDIA_API_KEY`）。候选：B1 结构化输出用 `nvidia/nemotron-3.5-lightning-30b-a3b`，调查 Agent 用 `nvidia/nemotron-3.5-super-vl-120b-a12b`。key 已于 2026-10-21 到位；`MODEL_MODE=scripted` 时仍用脚本化模型（pi-ai faux provider）。
- 除 Jev 与 NVIDIA 外不引入其他 LLM。

## 8. 核心概念：Durable Jev Agent（2026-10-21）

POC 的出发点：规则数量上来、结构化与非结构化规则交织、带状态和人工环节时，传统"代码 + rule engine + decision table"写起来太累。目标是用少数几个 Durable Jev Agent 承载各业务模块，模块之间用 A2A 协作。

- 一个业务模块 = 一个 Durable Jev Agent：规则图（声明式配置：依赖、适用条件、状态、失效） + 叶子求值器 + 人工门槛 + Pi Durable 持久化，对外是 A2A agent。
- 叶子求值器按规则性质分工：非结构化规则（描述、备注、文件、客户说明）由 Jev 回答；结构化规则（重量、时间、金额、矩阵）用代码，做代码最擅长的事。
- 依据：2026-10-21 探针中，把结构化规则直接写成 Jev Noul 问题，12 个案例里 4 个稳定判错，且全部是错误放行（超载、超授信、温度超标、违规混装）。
- 人工任务由各模块持有；Coordinator 只聚合各模块状态并执行最终放行事务。
- 调查 Agent（生成式模型 + Pi Durable）只在规则给不出结论、需要找证据或替代方案时启用。
- 要验证的问题：相对传统写法，实现量和变更成本下降多少；哪些规则可以交给 Jev（分界图）；盲测零错误放行。

