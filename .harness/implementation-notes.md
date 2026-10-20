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
| 2026-10-20 | R01 不设变更触发：变更命令的 schema 保证必填字段不会缺失，而 R01 位于几乎所有规则上游，带触发会让任何变更都重检全部规则 | 回放发现（LOG-005、LOG-007） |
| 2026-10-20 | T3.5/T3.6：LOG-001–008 全部 draft，`pnpm replay` 8/8 通过；回放发现并修复：组合例外路径下"可发运"判断错误、R01 触发过宽、变更后过期任务仍可操作。标注待用户审定 | P3 完成 |
| 2026-10-20 | T4.1–T4.3：语义规则经 `evaluateBranchWithJudge` 先问 judge 再求值；`MODEL_MODE=live` 时为 `CachingJudge(JevJudge)`，缓存表在各服务自己的库里，`pnpm replay` 在 live 下用 `var/data/semantic-cache.sqlite`。observedValue 带 provider/modelId | T4.2 只完成 Jev 部分 |
| 2026-10-20 | live 回放 LOG-002/003（共 8 次判断，含缓存命中外的新请求）首轮失败：只给代码时 Jev 犹豫（LOG-003 锂电池申报 CONTROLLED 0.72；LOG-002 路线只有地点/承运商代码 0.75），均落入 UNKNOWN→人工，行为安全但与预期不符。修正为问题中给出类别定义、地点名、承运商名和车辆温控范围后 0.97/0.81，2/2 通过。未调阈值 | B1 |
| 2026-10-20 | 风险：live 值离阈值很近（R27 0.81 vs 0.8；R10 0.21 vs 0.2），轻微漂移就会改变门槛结果。回放/回归仍只用 scripted；B1 需统计阈值附近的翻转率 | T7.1 |
| 2026-10-20 | T4.4/T4.5：`AgentSession.events()` 先返回数组而非 AsyncIterable（同步测试更简单），T4.7 若 Pi 侧需要流式再改；run 只能通过 `resultTool` 成功调用产出结果，模型停止或超预算一律 escalated 交给人 | design 7.1 |
| 2026-10-20 | T4.6：调查 agent 的候选校验复用规则引擎（`evaluateSelectedRules` 只重算 R05/R11/R16/R24/R25/R26，其余取当前结果），提交工具再校验一次；提议存 coordinator `investigations` 表，状态机 RUNNING→PROPOSED/NO_CANDIDATE/ESCALATED，PROPOSED→ACCEPTED/REJECTED/STALE；接受在同一事务里写 changeCarrier 与 ACCEPTED，其他计划变更使未决提议 STALE | design 7 |
| 2026-10-20 | T4.6：调查 agent 目前在 coordinator 进程内运行（`inProcessInvestigator`），未放到 transport-planning 服务后面；服务边界与 A2A 在 P5 处理。无 NVIDIA key 时用确定性的 `ScriptedInvestigatorModel` | P5、NVIDIA key |
| 2026-10-20 | LOG-004 事件脚本把手工换承运商改为 investigateCarrier + acceptInvestigation，阶段断言不变，仍为 draft | 待用户审定 |
| 2026-10-20 | 用户要求的 live 抽测：8 个案例全部用真实 Jev 回放（约 13 次新判断）+ 工作台 live 演示（各服务各自缓存，再约 20 次），之后关回 scripted。回放 5/8 通过。失败原因：①R27 问法"指令是否允许路线"不合常识，LOG-001 的交货口/电话指令与路线无关，Jev 给 0.58–0.62 → 转人工；应改问"指令是否禁止/限制该路线"；②LOG-005 R03"病床=GENERAL"在 0.76 与 0.81 之间漂移，同一输入跨过 0.8 阈值，一次转人工一次通过；③LOG-008 检查记录"gel packs partly thawed"，Jev 判 cold_chain_risk（1.0），草稿标注为 no_risk，从现实看 Jev 更合理，需用户审定标注 | 用户审定、B1 |
| 2026-10-20 | T5.2：分支服务同时提供原生 `/evaluations` 与 A2A，二者共用同一求值与日志函数；Coordinator 用 `BRANCH_PROTOCOL=a2a` 切换，A2aCallError 映射为 BranchUnavailableError，故 TECHNICAL_FAILURE 处理不变。H4 测试：同一组订单两种协议结果完全一致，CoordinatorService 无改动 | H4 |
| 2026-10-20 | 验证 A2A 时发现 launcher 缺陷：旧 launcher 留下的服务进程仍占端口并通过新 launcher 的健康检查，demo reset 删除的库文件被旧进程继续写入（已删除 inode），重启即丢数据。修复：启动前若健康地址已有应答则拒绝启动，启动后确认子进程仍存活 | 故障场景 |
| 2026-10-20 | T5.3：做故障清单时发现 F05 缺口——Jev SDK 重试已关，但项目里没有任何重试，进程内（base 分支 R03）判断失败会作为普通异常抛出，订单停在原状态。修复：`RetryingJudge`（仅瞬时错误、指数退避、最多 3 次）+ `JudgeUnavailableError` 映射为分支不可用 → TECHNICAL_FAILURE，可 reevaluate 恢复 | F05 |
| 2026-10-20 | T5.3：`pnpm faults` 11/11 通过（F01–F10 + 崩溃循环）。F03 目前覆盖"等待人工审核时重启"，等待 agent 补资料（follow-up rounds）尚未实现；F06 为快照恢复与重复提交，SSE 在 T6.4；F09 用脚本化答案验证架构边界，真实 Jev 对注入文本的反应放到 T5.6 live 抽测 | T5.6、T6.4 |
| 2026-10-20 | T5.4：F15 发现计划变更不带基准版本，看着 r1 的人可能把改动叠加到别人的 r2 上。新增乐观并发：`applyChange(…, expectedRevision)`，HTTP 用 `If-Match`，工作台发送当前显示的版本；不一致返回 CONFLICT。`pnpm faults` 19/19 通过。F18 中拒绝来自放行事务内"确认任务已被撤回"（NOT_READY_TO_DISPATCH）而非版本检查，二者在同一事务，均不放行 | F15、F18 |
| 2026-10-20 | T5.6 live 抽测（A2A + 真实 Jev，20 次判断）：A2A 路径正常（24 个任务全部完成）。阈值漂移在 0.2 线上也复现（LOG-003 R10 0.21→0.20，同一输入由转人工变为 FAIL）；注入文本使 R10 从 0.21 升到 0.38（未过 0.8，仍转人工），R18 不受影响。R27 问法、LOG-008 标注、阈值缓冲带仍待用户决定（T7.0） | T7.0 |
| 2026-10-20 | 用户要求用 ui-ux-pro-max（已装入 `.claude/skills/`，仅本地数据 + 标准库 Python，脚本路径改为仓库相对路径）优化工作台。按其准则审计发现：无键盘焦点环、操作进行时无反馈、"为什么卡住/谁能处理"埋在页面下方、无窄屏布局、选中的案例不在 URL。已修：全局 `:focus-visible`、aria-current、busy 状态（fieldset disabled + Working 横幅）、案例顶部"Failed / Waiting for"摘要、双栏面板、窄屏单栏与流程图最小缩放、URL hash 深链。其推荐的整体方案（Fira 字体、落地页模式）不适用于操作型界面，未采纳 | 工作台 |
| 2026-10-20 | T6.1：事件写各服务自己的 SQLite outbox（与业务数据同库，业务事务内的事件随事务提交/回滚），`OutboxRelay` 后台批量 POST 到收集器（端口 4200），收集器按 eventId 幂等入库并给出递增 sequence 游标。收集器宕机时业务照常（实测批准照常返回 200，12 条事件排队，恢复后全部到达、outbox 清零）。coordinator、三个分支服务、Jev 判断（只存输入哈希与原始答案，不存病例文本）、调查 agent 均已埋点；原生与 A2A 两种协议下事件一致。测试里读 outbox 要显式给大 limit（默认 100） | T6.2 |
