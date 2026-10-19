# Getting started

## 环境

- Node 22+
- pnpm 10+

## 命令

| 命令 | 作用 |
|---|---|
| `pnpm bootstrap` | 安装依赖并编译 |
| `pnpm test` | 运行单元测试 |
| `pnpm lint` | 检查格式与 lint |
| `pnpm spikes` | 运行 M0 技术预检 spike（无需 key），结论见 [m0-findings.md](m0-findings.md) |

`pnpm start` 与 `pnpm demo:reset` 将在 P2 提供。

## 模型模式

复制 `.env.example` 为 `.env`。默认 `MODEL_MODE=scripted`，无需 key 即可演示；提供 key 后改为 `live`。
