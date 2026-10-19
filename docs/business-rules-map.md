# 业务规则关系图（R01–R40）

箭头表示"前者是后者的前置"。虚线表示"只在某条件下才触发"。

| 颜色 | 含义 |
|---|---|
| 灰 | 代码 / 决策表（确定性） |
| 紫 | Jev 语义判断 |
| 红 | 人工审批（给出决定） |
| 橙 | 人工操作（现场动作 + 证据） |
| 绿 | 组合门槛（AND / OR / ALL） |
| 黄 | 模拟业务写入（预订） |

## 1. 全景：五个分支汇到整单放行

```mermaid
flowchart TD
    BASE["基础检查<br/>R01–R08"]
    BASE --> CTRL["受控货分支<br/>R09–R14"]
    BASE --> COLD["冷链分支<br/>R15–R23"]
    BASE --> PLAN["运输计划分支<br/>R24–R30"]
    COM["商务分支<br/>R31–R36"]

    CTRL --> R37{{"R37 货物全部通过<br/>ALL 货件"}}
    COLD --> R37
    BASE --> R37

    R13h["R13 合规签核"] -.-> R38
    R20h["R20 质量处置"] -.-> R38
    R21h["R21 仓库整改"] -.-> R38
    R38{{"R38 装载前人工任务<br/>全部有效"}}

    PLAN --> R39
    COM --> R39
    R37 --> R39
    R38 --> R39
    R39["R39 装载扫码 + 复核<br/>+ 调度员确认"]

    R39 --> R40{{"R40 整单允许发运<br/>提交时再校验一次"}}
    BASE --> R40
    PLAN --> R40
    COM --> R40

    classDef gate fill:#d3f9d8,stroke:#2b8a3e,color:#000
    classDef approval fill:#ffe3e3,stroke:#c92a2a,color:#000
    classDef operation fill:#ffe8cc,stroke:#d9480f,color:#000
    classDef branch fill:#e7f5ff,stroke:#1864ab,color:#000
    class R37,R38,R40 gate
    class R13h,R20h approval
    class R21h,R39 operation
    class BASE,CTRL,COLD,PLAN,COM branch
```

## 2. 全部 40 条规则的依赖

```mermaid
flowchart TD
    subgraph base["基础"]
        R01["R01 必填完整"] --> R02["R02 重量尺寸单位"]
        R01 --> R03["R03 声明 vs 文字描述"]
        R01 --> R08["R08 无版本冲突"]
        R02 --> R04["R04 确定分支<br/>普通/冷链/受控/混装"]
        R03 --> R04
        R02 --> R05["R05 车辆载重体积"]
        R06["R06 到达在时间窗"]
        R07["R07 运输段衔接"]
    end

    subgraph controlled["受控货"]
        R04 -->|受控| R09["R09 资料齐全"]
        R09 --> R10["R10 文件 vs 货物描述"]
        R09 --> R11["R11 承运商资格"]
        R04 --> R12["R12 混装兼容矩阵"]
        R10 --> R13["R13 合规员签核"]
        R11 --> R13
        R12 --> R13
        R13 --> R14{{"R14 受控可放行<br/>R09..R13 AND"}}
    end

    subgraph coldchain["冷链"]
        R04 -->|冷链| R15["R15 目标温区明确"]
        R15 --> R16["R16 车辆温控覆盖"]
        R15 --> R17["R17 传感器有效"]
        R15 --> R19["R19 温度越界超时"]
        R17 --> R19
        R18["R18 检查备注风险信号"]
        R19 -.->|仅越界时| R20["R20 质量员处置"]
        R18 -.->|有风险| R21["R21 仓库重新包装"]
        R20 -.->|要求整改| R21
        R21 --> R22["R22 复测通过"]
        R16 --> R23{{"R23 冷链可放行"}}
        R17 --> R23
        R20 --> R23
        R22 --> R23
    end

    subgraph transport["运输计划"]
        R07 --> R24["R24 服务区域匹配"]
        R05 --> R25["R25 车辆装备适配"]
        R16 --> R25
        R04 --> R26["R26 中转设施能力"]
        R07 --> R26
        R27["R27 客户文字限制"]
        R28["R28 备用路线重跑同样检查"]
        R24 --> R29["R29 承运商预订"]
        R25 --> R29
        R26 --> R29
        R27 --> R29
        R06 --> R29
        R29 --> R30{{"R30 运输计划有效"}}
    end

    subgraph commercial["商务"]
        R31["R31 账户未停用"]
        R32["R32 费用在授信内"]
        R32 -.->|超授信| R33["R33 超额在可批额度内"]
        R33 --> R34["R34 主管批准授信例外"]
        R35["R35 改派加价审批"]
        R31 --> R36{{"R36 商务可放行"}}
        R32 --> R36
        R34 --> R36
        R35 --> R36
    end

    R14 --> R37{{"R37 货物全部通过"}}
    R23 --> R37
    R13 --> R38{{"R38 装载前人工任务有效"}}
    R20 --> R38
    R21 --> R38
    R30 --> R39["R39 装载 + 调度员确认"]
    R36 --> R39
    R37 --> R39
    R38 --> R39
    R08 --> R40{{"R40 整单发运"}}
    R39 --> R40

    classDef code fill:#f1f3f5,stroke:#495057,color:#000
    classDef jev fill:#e5dbff,stroke:#5f3dc4,color:#000
    classDef approval fill:#ffe3e3,stroke:#c92a2a,color:#000
    classDef operation fill:#ffe8cc,stroke:#d9480f,color:#000
    classDef gate fill:#d3f9d8,stroke:#2b8a3e,color:#000
    classDef write fill:#fff3bf,stroke:#e67700,color:#000
    class R01,R02,R04,R05,R06,R07,R08,R09,R11,R12,R15,R16,R17,R19,R24,R25,R26,R28,R31,R32,R33,R35 code
    class R03,R10,R18,R27 jev
    class R13,R20,R34 approval
    class R21,R22,R39 operation
    class R14,R23,R30,R36,R37,R38,R40 gate
    class R29 write
```

## 3. 两个最容易绕过的嵌套门槛

### 商务：`R31 AND (R32 OR (R33 AND R34)) AND R35`

```mermaid
flowchart LR
    R31["R31 账户正常"] --> AND1{{"AND"}}
    R32["R32 在授信内"] --> OR{{"OR"}}
    R33["R33 超额可批"] --> AND2{{"AND"}}
    R34["R34 主管批准"] --> AND2
    AND2 --> OR
    OR --> AND1
    R35["R35 加价已批<br/>（不需要时视为不适用）"] --> AND1
    AND1 --> R36["R36 商务可放行"]

    classDef gate fill:#d3f9d8,stroke:#2b8a3e,color:#000
    classDef approval fill:#ffe3e3,stroke:#c92a2a,color:#000
    class AND1,AND2,OR gate
    class R34,R35 approval
```

要测的点：超授信时只有主管批准不够，还必须 R33 在可批额度内；R33/R34 在等待中（UNKNOWN）时 OR 不能借此变成通过。

### 冷链整改链：顺序不能跳

```mermaid
flowchart LR
    A["R19 发现越界"] --> B["R20 质量员处置<br/>（人工审批）"]
    C["R18 Jev 发现包装破损"] --> D
    B -->|要求整改| D["R21 仓库重新包装<br/>（人工操作 + 证据）"]
    D --> E["R22 复测"]
    E -->|通过| F["R23 冷链可放行"]
    E -->|失败| G["继续 HOLD<br/>新一轮整改或处置"]
    G --> D

    classDef approval fill:#ffe3e3,stroke:#c92a2a,color:#000
    classDef operation fill:#ffe8cc,stroke:#d9480f,color:#000
    classDef jev fill:#e5dbff,stroke:#5f3dc4,color:#000
    class B approval
    class D,E operation
    class C jev
```

要测的点：点"批准"不能代替整改和复测；整改完成只解锁复测，不直接解锁发运；货物再次整改后，旧的质量批准作废（LOG-008）。

## 4. 人为参与一览

| 规则 | 类型 | 角色 | 绑定的版本 |
|---|---|---|---|
| R13 | 审批 | 合规审核员 | 货物 + 承运商 + 路线 |
| R20 | 审批 | 质量审核员 | 温控记录 + 包装版本 |
| R34 | 审批 | 商务主管 | 客户 + 报价版本 |
| R35 | 审批 | 商务主管 | 报价差额 |
| R21 | 操作 | 仓库操作员 | 整改轮次 |
| R22 | 操作（采集） | 仓库操作员 | 整改后版本 |
| R39 | 操作 + 确认 | 仓库操作员 + 调度员 | 装载版本 |

换车或换路线会让 R13、R16、R25、R29 以及相关审批失效；只改无关联系人不会。
