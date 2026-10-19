# Getting started

## 环境

- Node 22+
- pnpm 10+
- 无需任何 API key：默认 `MODEL_MODE=scripted`，语义判断使用案例文件中的脚本化答案。

## 三步跑起来

```bash
pnpm bootstrap     # 安装依赖并编译
pnpm start         # 启动 Coordinator、工作台和本地控制端
pnpm demo:reset    # 另开一个终端：清库并载入预置案例
```

`pnpm start` 启动后打印：

| 地址 | 内容 |
|---|---|
| http://127.0.0.1:5173/ | 工作台 |
| http://127.0.0.1:4100/cases | Coordinator API |
| http://127.0.0.1:4000/processes | 本地控制端（只监听 127.0.0.1） |

`Ctrl+C` 停止全部进程。数据保存在 `var/data/`，重启后仍在；`pnpm demo:reset` 或工作台的"重置演示"按钮会清空后重新载入。

## 演示 LOG-001：普通货从提交到发运

1. 打开工作台，左侧选择 LOG-001。订单状态为"等待人工"。
2. 展开规则树：除 R39 外的门槛都已通过；R39-CONFIRM 显示"被 R39-LOAD 阻塞"。
3. 右上角身份切到"调度员"，在 R39-LOAD 任务上点"提交完成证据"：服务端返回 403，因为装载必须由仓库操作员完成（F11）。
4. 身份切回"仓库操作员"，填写 `loadScanRef` 和 `physicalCheckBy` 后提交。缺任一字段会被拒绝（F14）。订单变为"可发运"。
5. 身份切到"调度员"，点"确认发运"。Coordinator 在同一事务内重读当前版本、重新求值 R40，通过后写入"已发运"；不通过则整个事务回滚。

## 进程控制

本地控制端供演示使用（后续阶段由工作台调用）：

```bash
curl -X POST http://127.0.0.1:4000/processes/coordinator/kill      # 模拟崩溃
curl -X POST http://127.0.0.1:4000/processes/coordinator/start     # 重启，数据仍在
curl http://127.0.0.1:4000/processes                               # 查看进程状态
```

## 其他命令

| 命令 | 作用 |
|---|---|
| `pnpm test` | 运行单元测试 |
| `pnpm lint` | 检查格式与 lint |
| `pnpm spikes` | 运行 M0 技术预检 spike，结论见 [m0-findings.md](m0-findings.md) |

## 模型模式与 API 额度

复制 `.env.example` 为 `.env`。默认 `MODEL_MODE=scripted`，所有测试、spike 与演示都不发真实请求。
只有显式设置 `MODEL_MODE=live` 并提供 `TYPESAFE_API_KEY` 时才调用 Jev；Jev 额度有限，只在关键的完整测试中使用。

## 常见问题

- 端口被占用：确认 4000、4100、5173 没有其他进程，或先 `Ctrl+C` 停掉上一次的 `pnpm start`。
- `pnpm demo:reset` 提示连接失败：需要先在另一个终端运行 `pnpm start`。
