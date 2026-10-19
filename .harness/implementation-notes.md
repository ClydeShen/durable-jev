# Implementation notes

只记录计划变动和与 spec / design / roadmap 不符、需要用户知道的 high level 信息。

| 日期 | 事项 | 影响 |
|---|---|---|
| 2026-10-19 | Jev 文档只给出 Python SDK（`typesafe_sdk`），未找到官方 TS 包；npm 上仅有第三方适配器 | T0.5 需确认 HTTP 接口，可能自写轻量客户端 |
| 2026-10-19 | 选定依赖当前最新：pi-durable 1.3.0、pi-ai 1.3.0、@a2a-js/sdk 1.3.0 | P0 验证后锁定 |
| 2026-10-19 | TypeScript 选 6.0.3 而非最新 7.x（原生编译器），避免 `tsc -b` project references 兼容风险 | 无功能影响 |
