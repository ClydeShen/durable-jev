import type {
  CargoCategory,
  CheckStatus,
  OrderStatus,
  Role,
  RuleEngineKind,
  Shipment,
} from '@durable-jev/contracts'

export const roleLabels: Record<Role, string> = {
  transportPlanner: '运输计划员',
  complianceReviewer: '合规审核员',
  qualityReviewer: '质量审核员',
  commercialManager: '商务主管',
  warehouseOperator: '仓库操作员',
  dispatcher: '调度员',
  technicalEvaluator: '技术评估者',
}

/** The person who acts in each role, as in the demo script; switching role switches person. */
export const demoOperators: Record<Role, string> = {
  transportPlanner: 'pat',
  complianceReviewer: 'alice',
  qualityReviewer: 'bob',
  commercialManager: 'carol',
  warehouseOperator: 'wen',
  dispatcher: 'dee',
  technicalEvaluator: 'eve',
}

export const checkStatusLabels: Record<CheckStatus, string> = {
  PASS: '通过',
  FAIL: '不通过',
  UNKNOWN: '未知',
  NOT_APPLICABLE: '不适用',
  ERROR: '错误',
  BLOCKED_DEPENDENCY: '被阻塞',
  WAITING_HUMAN: '等待人工',
  INVALIDATED: '已失效',
}

export const orderStatusLabels: Record<OrderStatus, string> = {
  SUBMITTED: '已提交',
  EVALUATING: '评估中',
  ON_HOLD: '暂停',
  AWAITING_HUMAN: '等待人工',
  READY_TO_DISPATCH: '可发运',
  DISPATCHED: '已发运',
  REJECTED: '已拒绝',
  TECHNICAL_FAILURE: '技术故障',
}

export const kindLabels: Record<RuleEngineKind, string> = {
  expression: '表达式',
  code: '代码',
  decisionTable: '决策表',
  semantic: 'Jev',
  humanGate: '人工',
  combinator: '组合',
}

const severity: CheckStatus[] = [
  'ERROR',
  'FAIL',
  'WAITING_HUMAN',
  'BLOCKED_DEPENDENCY',
  'UNKNOWN',
  'INVALIDATED',
  'PASS',
  'NOT_APPLICABLE',
]

export function mostSevere(statuses: readonly CheckStatus[]): CheckStatus | undefined {
  return severity.find((status) => statuses.includes(status))
}

/** What a rule of each kind does, in words for the audience. */
export const kindExplanations: Record<RuleEngineKind, string> = {
  expression: '按公式自动判断',
  code: '由一段代码判断',
  decisionTable: '查决策表判断',
  semantic: '由 Jev 阅读文字后判断',
  humanGate: '需要人来批准或操作',
  combinator: '汇总其他规则的结论',
}

export const ruleScopeLabels: Record<'order' | 'cargoItem' | 'leg', string> = {
  order: '整单检查一次',
  cargoItem: '每件货物各检查一次',
  leg: '每个运输段各检查一次',
}

export const changeLabels: Record<string, string> = {
  cargo: '货物',
  route: '路线',
  carrier: '承运商',
  quote: '报价',
  documents: '文件',
}

/** Field names a human task asks for, as the person filling them in reads them. */
export const evidenceLabels: Record<string, string> = {
  loadScanId: '装载扫码号',
  sealNumber: '封条号',
  deliveryNoteRef: '送货单号',
  recipientName: '收货人姓名',
  newPackagingId: '新包装编号',
  photoRef: '照片编号',
  retestDeciCelsius: '复测温度（0.1 °C）',
}

export const cargoCategoryLabels: Record<CargoCategory, string> = {
  general: '普通货物',
  coldChain: '冷链',
  controlled: '管制品',
}

export const handoverLabels: Record<Shipment['handover'], string> = {
  dock: '装卸平台',
  curbside: '路边交接',
  customerSite: '客户现场',
}

/** Kinds of document an order carries, as the customer names them. */
export const documentKindLabels: Record<string, string> = {
  transportInstructions: '运输说明',
  packingList: '装箱单',
  safetyDataSheet: '安全数据表',
  inspectionChecklist: '检查清单',
  temperatureLog: '温度记录',
  customerRestrictions: '客户限制说明',
  controlledDeclaration: '管制品申报',
  importPermit: '进口许可',
  productRegistration: '产品注册',
  healthCertificate: '卫生证书',
  certificateOfOrigin: '原产地证书',
  batteryTestSummary: '电池测试摘要',
  commercialInvoice: '商业发票',
}

/** Why an action was refused, said so the presenter knows what to do next. */
export const refusalMessages: Record<string, string> = {
  STALE_TARGET: '这个案例的资料已经变了，这张任务随之作废。待办已刷新，请处理新的任务。',
  MISSING_EVIDENCE: '还缺必填的证据，请把每一项都填上再提交。',
  UNAUTHORIZED: '当前角色不能处理这张任务，请切换到任务要求的角色。',
  EXPIRED: '这张任务已过期，等 agent 重新开出任务。',
  NOT_OPEN: '这张任务已经处理过了。',
  NOT_FOUND: '找不到这张任务，它可能已经被新的任务替换。',
  STEP_NOT_ACTIVE: '审批要按顺序来，前面的步骤还没有批准。',
  SAME_ACTOR: '同一个人不能批准同一审批链里的两步，请换另一位审批人。',
  WRONG_TASK_TYPE: '这类任务不能这样处理：审批要批准或拒绝，现场操作要填证据完成。',
  AGENT_UNAVAILABLE: '负责这条规则的 agent 暂时不可用，稍后再试。',
  NOT_DISPATCHER: '只有调度员能确认发运，请切换到调度员。',
  ALREADY_DISPATCHED: '这个案例已经发运过了。',
  CHANGED: '确认之前案例资料变了，请看过最新结果再确认。',
  NOT_RELEASABLE: '还有规则没通过或在等人处理，现在不能发运。',
}
