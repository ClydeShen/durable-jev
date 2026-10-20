# .harness

Claude delivery agent 的工作区，由 agent 自治管理。用户文档和测试物料不放这里。

| 文件 | 作用 | 何时更新 |
|---|---|---|
| `prd.md` | 原始 PRD v0.3，只读 | 用户给出新版本时整体替换 |
| `spec.md` | 与用户对齐后的范围与裁剪，优先级高于 `prd.md` | 用户改变范围时 |
| `design.md` | 架构、接口、语义、工程约定 | 设计决定改变时 |
| `roadmap.md` | 阶段 → 任务，带状态 | 每完成一个任务 |
| `implementation-notes.md` | 计划变动、与 spec/design/task 不符的意外 | 只记 high level 意外，不记实施细节 |

## 工作协议

1. 开始任务前读 `spec.md`、`design.md`、`roadmap.md` 中对应任务。
2. 一个任务拆成多个小 commit，每个 commit 只做一件可独立理解的事（例如：先加 schema，再加求值，再加测试，最后勾选 roadmap）；不要把整改、文档、代码混在一个 commit。完成后在 `roadmap.md` 勾选（单独的 `docs(roadmap)` commit 或随任务最后一个 commit）。
   - commit message 用 Conventional Commits：`<type>(<scope>): <subject>`，type 取 `feat | fix | refactor | test | docs | chore | build`，scope 为包或目录名（如 `rule-engine`、`store`、`spike-jev`、`harness`），subject 用英文祈使句、小写开头、不加句号。
   - 示例：`feat(rule-engine): add pending-aware and/or combinators`、`docs(m0): record live jev results`。
3. 偏离设计或任务目标时，先改 `design.md` / `roadmap.md`，再在 `implementation-notes.md` 记一行原因。
4. 每个大阶段结束前做一次真实 Jev 抽测（见 `spec.md` 第 8 节），记录到 `docs/live-checks.md`，把发现转成 roadmap 任务或 implementation-notes 条目后再进入下一阶段。
5. 冲突优先级：用户最新指令 > `spec.md` > `design.md` > `prd.md`。
