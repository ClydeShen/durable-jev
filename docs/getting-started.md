# Getting started

## 环境

- Node 22.9+（用到 `--env-file-if-exists`）
- pnpm 10+
- 无需任何 key：默认 `MODEL_MODE=scripted`，Jev 判断按案例文件里录好的答案回放

## 一键启动

```bash
pnpm bootstrap   # 安装依赖并编译
pnpm start       # 编译并启动全部服务
```

浏览器打开 <http://localhost:4100>。演示数据在首次启动时自动载入；随时用页面右上角"重置演示"或 `pnpm demo:reset` 恢复初始状态。

## 演示 LOG-001：普通货从提交到发运

1. 左侧选择 **LOG-001**。状态为"等待人工"，等待仓库操作员。
2. 中间是规则图：节点是规则，连线是依赖，颜色是状态。除 R39（装载）与 R40（放行）外全部通过。点任意节点看每个货件 / 运输段的结果、观察值和阻塞原因。
3. 右上角角色选 **仓库操作员**，右侧待办里填写 `loadScanId` 与 `sealNumber`，点"完成并提交证据"。漏填任一项会被拒绝。
4. 角色切到 **调度员**，案例变为"可发运"，点"确认发运"。系统在同一事务里重新核对 R40 与资料版本，通过才标记"已发运"。

可以顺便试：用错误角色办理任务、发运前点确认（会提示被谁阻塞）、重复发运。

## 命令

| 命令 | 作用 |
|---|---|
| `pnpm bootstrap` | 安装依赖并编译 |
| `pnpm start` | 编译并启动全部服务，读取 `.env`（若存在） |
| `pnpm demo:reset` | 重新载入演示案例（服务需在运行） |
| `pnpm test` | 单元测试 |
| `pnpm typecheck` | 类型检查（含测试文件） |
| `pnpm lint` | 格式与 lint |
| `pnpm knip` | 检查未使用的代码、导出与依赖 |
| `pnpm spikes` | M0 技术预检 spike，结论见 [m0-findings.md](m0-findings.md) |

## 模型模式

| `MODEL_MODE` | 行为 |
|---|---|
| `scripted`（默认） | 不调用任何真实模型；Jev 判断回放 `eval/materials/cases/*.json` 中的 `scriptedJudgements` |
| `live` | 调用真实 Jev（`TYPESAFE_API_KEY`）。只有显式设为 `live` 才会产生真实调用 |

复制 `.env.example` 为 `.env` 修改即可，`pnpm start` 会读取。`pnpm models:live-check` 用两种真实模型各答一次示例问题。

## 目录

| 路径 | 内容 |
|---|---|
| `apps/coordinator` | 订单协调服务：API、放行事务、静态页面 |
| `apps/web` | 工作台页面 |
| `packages/agent-core` | Durable Jev Agent 运行时：规则包加载、案例求值、人工门槛 |
| `packages/rule-engine` | 规则图求值、FEEL 表达式、组合语义、配置校验、指纹与失效 |
| `packages/human-tasks` | 人工任务状态机与审批链 |
| `packages/model-providers` | Jev、结构化输出、脚本化判断 |
| `packages/logistics` | 参考数据、案例文件、订单到规则事实的转换 |
| `packages/store` | SQLite、迁移、幂等操作、outbox |
| `eval/materials` | 政策原文、政策参数、规则包、mock 数据、案例 |
| `var/data` | 运行时数据库（不提交） |
