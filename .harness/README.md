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
2. 一个任务一个或几个小 commit；完成后在 `roadmap.md` 勾选。
3. 偏离设计或任务目标时，先改 `design.md` / `roadmap.md`，再在 `implementation-notes.md` 记一行原因。
4. 冲突优先级：用户最新指令 > `spec.md` > `design.md` > `prd.md`。
