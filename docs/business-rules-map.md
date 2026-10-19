# Business rules map (R01–R40)

An arrow means "the source is a prerequisite of the target". A dashed arrow means "only triggered under a condition".

| Colour | Meaning |
|---|---|
| Grey | Code / decision table (deterministic) |
| Purple | Jev semantic judgement |
| Red | Human approval (a decision) |
| Orange | Human operation (field action + evidence) |
| Green | Combined gate (AND / OR / ALL) |
| Yellow | Simulated business write (reservation) |

## 1. Overview: five branches converge on dispatch release

```mermaid
flowchart TD
    BASE["Base checks<br/>R01–R08"]
    BASE --> CTRL["Controlled goods<br/>R09–R14"]
    BASE --> COLD["Cold chain<br/>R15–R23"]
    BASE --> PLAN["Transport plan<br/>R24–R30"]
    COM["Commercial<br/>R31–R36"]

    CTRL --> R37{{"R37 All cargo passes<br/>ALL cargo items"}}
    COLD --> R37
    BASE --> R37

    R13h["R13 Compliance sign-off"] -.-> R38
    R20h["R20 Quality disposition"] -.-> R38
    R21h["R21 Warehouse rework"] -.-> R38
    R38{{"R38 Pre-load human tasks<br/>all valid"}}

    PLAN --> R39
    COM --> R39
    R37 --> R39
    R38 --> R39
    R39["R39 Load scan + check<br/>+ dispatcher confirmation"]

    R39 --> R40{{"R40 Order may dispatch<br/>re-checked on commit"}}
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

## 2. Dependencies of all 40 rules

```mermaid
flowchart TD
    subgraph base["Base"]
        R01["R01 Required fields"] --> R02["R02 Weight, size, units"]
        R01 --> R03["R03 Declaration vs description"]
        R01 --> R08["R08 No version conflict"]
        R02 --> R04["R04 Branch determined<br/>general/cold/controlled/mixed"]
        R03 --> R04
        R02 --> R05["R05 Vehicle payload and volume"]
        R06["R06 Arrival within window"]
        R07["R07 Leg connections"]
    end

    subgraph controlled["Controlled goods"]
        R04 -->|controlled| R09["R09 Documents complete"]
        R09 --> R10["R10 Documents vs cargo description"]
        R09 --> R11["R11 Carrier qualification"]
        R04 --> R12["R12 Mixed-load compatibility matrix"]
        R10 --> R13["R13 Compliance sign-off"]
        R11 --> R13
        R12 --> R13
        R13 --> R14{{"R14 Controlled branch ready<br/>R09..R13 AND"}}
    end

    subgraph coldchain["Cold chain"]
        R04 -->|cold chain| R15["R15 Target range defined"]
        R15 --> R16["R16 Vehicle covers range"]
        R15 --> R17["R17 Sensor valid"]
        R15 --> R19["R19 Excursion beyond tolerance"]
        R17 --> R19
        R18["R18 Risk signal in inspection note"]
        R19 -.->|only on excursion| R20["R20 Quality disposition"]
        R18 -.->|risk found| R21["R21 Warehouse repack"]
        R20 -.->|rework required| R21
        R21 --> R22["R22 Retest passed"]
        R16 --> R23{{"R23 Cold chain ready"}}
        R17 --> R23
        R20 --> R23
        R22 --> R23
    end

    subgraph transport["Transport plan"]
        R07 --> R24["R24 Service area match"]
        R05 --> R25["R25 Vehicle equipment fit"]
        R16 --> R25
        R04 --> R26["R26 Hub capability"]
        R07 --> R26
        R27["R27 Customer text restrictions"]
        R28["R28 Alternative route re-runs checks"]
        R24 --> R29["R29 Carrier reservation"]
        R25 --> R29
        R26 --> R29
        R27 --> R29
        R06 --> R29
        R29 --> R30{{"R30 Transport plan valid"}}
    end

    subgraph commercial["Commercial"]
        R31["R31 Account active"]
        R32["R32 Cost within credit"]
        R32 -.->|over credit| R33["R33 Excess within approvable limit"]
        R33 --> R34["R34 Manager approves credit exception"]
        R35["R35 Extra cost approval for reroute"]
        R31 --> R36{{"R36 Commercial ready"}}
        R32 --> R36
        R34 --> R36
        R35 --> R36
    end

    R14 --> R37{{"R37 All cargo passes"}}
    R23 --> R37
    R13 --> R38{{"R38 Pre-load human tasks valid"}}
    R20 --> R38
    R21 --> R38
    R30 --> R39["R39 Loading + dispatcher confirmation"]
    R36 --> R39
    R37 --> R39
    R38 --> R39
    R08 --> R40{{"R40 Order dispatch"}}
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

## 3. The two nested gates most likely to be bypassed

### Commercial: `R31 AND (R32 OR (R33 AND R34)) AND R35`

```mermaid
flowchart LR
    R31["R31 Account active"] --> AND1{{"AND"}}
    R32["R32 Within credit"] --> OR{{"OR"}}
    R33["R33 Excess approvable"] --> AND2{{"AND"}}
    R34["R34 Manager approval"] --> AND2
    AND2 --> OR
    OR --> AND1
    R35["R35 Extra cost approved<br/>(not applicable when not required)"] --> AND1
    AND1 --> R36["R36 Commercial ready"]

    classDef gate fill:#d3f9d8,stroke:#2b8a3e,color:#000
    classDef approval fill:#ffe3e3,stroke:#c92a2a,color:#000
    class AND1,AND2,OR gate
    class R34,R35 approval
```

What to test: when over credit, a manager approval alone is not enough; R33 must also be within the approvable limit. While R33/R34 are pending (UNKNOWN), the OR must not turn into a pass.

### Cold chain rework chain: the order cannot be skipped

```mermaid
flowchart LR
    A["R19 Excursion found"] --> B["R20 Quality disposition<br/>(human approval)"]
    C["R18 Jev finds damaged packaging"] --> D
    B -->|rework required| D["R21 Warehouse repack<br/>(human operation + evidence)"]
    D --> E["R22 Retest"]
    E -->|pass| F["R23 Cold chain ready"]
    E -->|fail| G["Stay on HOLD<br/>new rework or disposition round"]
    G --> D

    classDef approval fill:#ffe3e3,stroke:#c92a2a,color:#000
    classDef operation fill:#ffe8cc,stroke:#d9480f,color:#000
    classDef jev fill:#e5dbff,stroke:#5f3dc4,color:#000
    class B approval
    class D,E operation
    class C jev
```

What to test: clicking "approve" cannot replace rework and retest; finishing rework only unlocks the retest, not dispatch; after the cargo is reworked again, the earlier quality approval is void (LOG-008).

## 4. Human involvement at a glance

| Rule | Type | Role | Bound to |
|---|---|---|---|
| R13 | Approval | Compliance reviewer | Cargo + carrier + route |
| R20 | Approval | Quality reviewer | Temperature record + packaging version |
| R34 | Approval | Commercial manager | Customer + quote version |
| R35 | Approval | Commercial manager | Quote difference |
| R21 | Operation | Warehouse operator | Rework round |
| R22 | Operation (capture) | Warehouse operator | Post-rework version |
| R39 | Operation + confirmation | Warehouse operator + dispatcher | Loading version |

Changing the vehicle or route invalidates R13, R16, R25, R29 and the related approvals; changing an unrelated contact does not.
