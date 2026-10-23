import type {
  CargoCategory,
  CheckStatus,
  OrderStatus,
  Role,
  RuleEngineKind,
  Shipment,
} from '@durable-jev/contracts'

export const roleLabels: Record<Role, string> = {
  transportPlanner: 'Transport planner',
  complianceReviewer: 'Compliance reviewer',
  qualityReviewer: 'Quality reviewer',
  commercialManager: 'Commercial manager',
  warehouseOperator: 'Warehouse operator',
  dispatcher: 'Dispatcher',
  technicalEvaluator: 'Technical evaluator',
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
  PASS: 'Passed',
  FAIL: 'Failed',
  UNKNOWN: 'Unknown',
  NOT_APPLICABLE: 'Not applicable',
  ERROR: 'Error',
  BLOCKED_DEPENDENCY: 'Blocked',
  WAITING_HUMAN: 'Needs a person',
  INVALIDATED: 'Invalidated',
}

export const orderStatusLabels: Record<OrderStatus, string> = {
  SUBMITTED: 'Submitted',
  EVALUATING: 'Evaluating',
  ON_HOLD: 'On hold',
  AWAITING_HUMAN: 'Needs people',
  READY_TO_DISPATCH: 'Ready to dispatch',
  DISPATCHED: 'Dispatched',
  REJECTED: 'Rejected',
  TECHNICAL_FAILURE: 'Technical failure',
}

export const kindLabels: Record<RuleEngineKind, string> = {
  expression: 'Expression',
  code: 'Code',
  decisionTable: 'Decision table',
  semantic: 'Jev',
  humanGate: 'Human',
  combinator: 'Combined',
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
  expression: 'decided automatically by a formula',
  code: 'decided by a piece of code',
  decisionTable: 'decided by looking up a decision table',
  semantic: 'decided by Jev after reading the text',
  humanGate: 'needs a person to approve or act',
  combinator: "combines other rules' results",
}

export const ruleScopeLabels: Record<'order' | 'cargoItem' | 'leg', string> = {
  order: 'checked once for the whole order',
  cargoItem: 'checked once for each cargo item',
  leg: 'checked once for each leg',
}

export const changeLabels: Record<string, string> = {
  cargo: 'cargo',
  route: 'route',
  carrier: 'carrier',
  quote: 'quote',
  documents: 'documents',
}

/** Field names a human task asks for, as the person filling them in reads them. */
export const evidenceLabels: Record<string, string> = {
  loadScanId: 'Load scan ID',
  sealNumber: 'Seal number',
  deliveryNoteRef: 'Delivery note number',
  recipientName: "Recipient's name",
  newPackagingId: 'New packaging ID',
  photoRef: 'Photo reference',
  retestDeciCelsius: 'Retest temperature (0.1 °C)',
}

export const cargoCategoryLabels: Record<CargoCategory, string> = {
  general: 'General',
  coldChain: 'Cold chain',
  controlled: 'Controlled',
}

export const handoverLabels: Record<Shipment['handover'], string> = {
  dock: 'Loading dock',
  curbside: 'Curbside',
  customerSite: 'Customer site',
}

/** Kinds of document an order carries, as the customer names them. */
export const documentKindLabels: Record<string, string> = {
  transportInstructions: 'Transport instructions',
  packingList: 'Packing list',
  safetyDataSheet: 'Safety data sheet',
  inspectionChecklist: 'Inspection checklist',
  temperatureLog: 'Temperature log',
  customerRestrictions: 'Customer restrictions',
  controlledDeclaration: 'Controlled goods declaration',
  importPermit: 'Import permit',
  productRegistration: 'Product registration',
  healthCertificate: 'Health certificate',
  certificateOfOrigin: 'Certificate of origin',
  batteryTestSummary: 'Battery test summary',
  commercialInvoice: 'Commercial invoice',
}

/** Why an action was refused, said so the presenter knows what to do next. */
export const refusalMessages: Record<string, string> = {
  STALE_TARGET:
    'The case changed, so this task no longer applies. Your tasks are refreshed; work on the new one.',
  MISSING_EVIDENCE: 'Some required evidence is missing. Fill in every field, then submit.',
  UNAUTHORIZED: 'This role cannot work on this task. Switch to the role the task asks for.',
  EXPIRED: 'This task has expired. The agent will open a new one.',
  NOT_OPEN: 'This task has already been handled.',
  NOT_FOUND: 'This task no longer exists; a newer task may have replaced it.',
  STEP_NOT_ACTIVE: 'Approvals go in order, and an earlier step is not approved yet.',
  SAME_ACTOR: 'One person cannot approve two steps of the same chain. Ask another approver.',
  WRONG_TASK_TYPE:
    'This task is not handled that way: approve or reject an approval; complete a field operation with its evidence.',
  AGENT_UNAVAILABLE: 'The agent that owns this rule is unavailable. Try again shortly.',
  NOT_DISPATCHER: 'Only the dispatcher can confirm dispatch. Switch to the dispatcher.',
  ALREADY_DISPATCHED: 'This case has already been dispatched.',
  CHANGED: 'The case changed before you confirmed. Check the latest results, then confirm again.',
  NOT_RELEASABLE:
    'Some rules have not passed or still wait for a person, so it cannot be dispatched yet.',
}

/** A count with its noun, singular or plural: "1 item", "2 items". */
export const countOf = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`
