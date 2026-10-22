# durable-jev

持久化业务 Agent POC：运输订单放行与异常处置工作台。

```bash
pnpm bootstrap   # 安装依赖并编译
pnpm start       # 启动全部服务，浏览器打开 http://localhost:4100
```

默认 `MODEL_MODE=scripted`，无需任何 key 即可完整演示。

## 文档

| 想做什么 | 读这篇 |
|---|---|
| 跑起来、走一遍 LOG-001、查命令 | [getting-started.md](docs/getting-started.md) |
| 做一场约 20 分钟的演示 | [demo-guide.md](docs/demo-guide.md) |
| 理解 agent 如何组织、能否承载大规模规则 | [agent-architecture.md](docs/agent-architecture.md) |
| 了解调查助手的预算、超时与人工把关 | [runtime-controls.md](docs/runtime-controls.md) |
| 看真实模型的调优过程与结果 | [tuning-log.md](docs/tuning-log.md) |
| 看包之间的真实依赖关系（自动生成） | [architecture-graph.md](docs/architecture-graph.md) |
| 了解工程约定与每条约定由哪个工具强制 | [engineering.md](docs/engineering.md) |
| 回顾 M0 技术预检结论 | [m0-findings.md](docs/m0-findings.md) |

## 目录

| 目录 | 内容 |
|---|---|
| `apps/` | `coordinator`（订单协调 agent 与 API）、`agent`（各业务 agent 进程）、`web`（Console） |
| `packages/` | 可复用的核心：`contracts`、`rule-engine`、`agent-core`、`agent-harness`、`agent-transport`、`logistics` 等 |
| `eval/` | 演示物料、回放、筛选与故障场景 |
| `tools/`、`scripts/` | 开发辅助脚本 |
| `spikes/` | M0 预检的可复现实验 |

提交前运行 `pnpm check`；同样的检查在 CI 中运行。
