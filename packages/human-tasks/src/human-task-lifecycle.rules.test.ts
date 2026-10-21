import type {
  CaseId,
  HumanTaskId,
  HumanTaskTarget,
  RuleId,
  UtcTimestamp,
} from '@durable-jev/contracts'
import { describe, expect, it } from 'vitest'
import {
  applyHumanTaskCommand,
  canBeSuperseded,
  createHumanTask,
  humanGateStatus,
  supersedeForNewTarget,
  supersedeTask,
} from './human-task-lifecycle.rules.js'

const target: HumanTaskTarget = {
  caseRevision: 1,
  entityVersions: { cargo: 1, route: 1, carrier: 1, quote: 1 },
  inputFingerprint: 'fp-carrier-A',
}
const rerouted: HumanTaskTarget = {
  caseRevision: 2,
  entityVersions: { cargo: 1, route: 2, carrier: 2, quote: 1 },
  inputFingerprint: 'fp-carrier-B',
}
const beforeDeadline = '2026-11-01T09:00:00Z' as UtcTimestamp
const afterDeadline = '2026-11-01T13:00:00Z' as UtcTimestamp

const complianceApproval = createHumanTask({
  humanTaskId: 'HT-1' as HumanTaskId,
  caseId: 'CASE-1' as CaseId,
  ruleId: 'R13' as RuleId,
  taskType: 'APPROVAL',
  requiredRole: 'COMPLIANCE_REVIEWER',
  target,
  prerequisites: ['R10', 'R11', 'R12'] as RuleId[],
  requiredEvidenceFields: [],
  createdAt: '2026-11-01T08:00:00Z' as UtcTimestamp,
  expiresAt: '2026-11-01T12:00:00Z' as UtcTimestamp,
})

const repackOperation = createHumanTask({
  ...complianceApproval,
  humanTaskId: 'HT-2' as HumanTaskId,
  ruleId: 'R21' as RuleId,
  taskType: 'OPERATION',
  requiredRole: 'WAREHOUSE_OPERATOR',
  requiredEvidenceFields: ['repackPhotoRef', 'retestReadingDeciCelsius'],
})

const current = { now: beforeDeadline, currentTarget: target }

describe('human task commands', () => {
  it('lets the required role approve the current target', () => {
    const result = applyHumanTaskCommand(
      complianceApproval,
      { kind: 'approve', actor: 'COMPLIANCE_REVIEWER' },
      current,
    )
    expect(result).toMatchObject({ accepted: true, task: { status: 'APPROVED' } })
  })

  it('records approval conditions such as required rework', () => {
    const result = applyHumanTaskCommand(
      complianceApproval,
      { kind: 'approve', actor: 'COMPLIANCE_REVIEWER', conditions: ['REWORK_REQUIRED'] },
      current,
    )
    expect(result).toMatchObject({ task: { decision: { conditions: ['REWORK_REQUIRED'] } } })
  })

  it('refuses an approval from another role (F11)', () => {
    const result = applyHumanTaskCommand(
      complianceApproval,
      { kind: 'approve', actor: 'COMMERCIAL_MANAGER' },
      current,
    )
    expect(result).toMatchObject({ accepted: false, reason: 'UNAUTHORIZED_ROLE' })
  })

  it('refuses an approval after the deadline and marks the task expired (F12)', () => {
    const result = applyHumanTaskCommand(
      complianceApproval,
      { kind: 'approve', actor: 'COMPLIANCE_REVIEWER' },
      { ...current, now: afterDeadline },
    )
    expect(result).toMatchObject({
      accepted: false,
      reason: 'EXPIRED',
      task: { status: 'EXPIRED' },
    })
  })

  it('refuses an approval for an outdated plan version', () => {
    const result = applyHumanTaskCommand(
      complianceApproval,
      { kind: 'approve', actor: 'COMPLIANCE_REVIEWER' },
      { ...current, currentTarget: rerouted },
    )
    expect(result).toMatchObject({ accepted: false, reason: 'STALE_TARGET' })
  })

  it('does not let an approval click complete a field operation', () => {
    const result = applyHumanTaskCommand(
      repackOperation,
      { kind: 'approve', actor: 'WAREHOUSE_OPERATOR' },
      current,
    )
    expect(result).toMatchObject({ accepted: false, reason: 'WRONG_TASK_TYPE' })
  })

  it('requires every evidence field to complete an operation (F14)', () => {
    const missingRetest = applyHumanTaskCommand(
      repackOperation,
      {
        kind: 'complete',
        actor: 'WAREHOUSE_OPERATOR',
        fields: { repackPhotoRef: 'photo-1' },
        evidenceRefs: [],
      },
      current,
    )
    expect(missingRetest).toMatchObject({ accepted: false, reason: 'MISSING_EVIDENCE' })
  })

  it('does not change a task that is already decided', () => {
    const approved = applyHumanTaskCommand(
      complianceApproval,
      { kind: 'approve', actor: 'COMPLIANCE_REVIEWER' },
      current,
    ).task
    const result = applyHumanTaskCommand(
      approved,
      { kind: 'reject', actor: 'COMPLIANCE_REVIEWER', reason: 'changed my mind' },
      current,
    )
    expect(result).toMatchObject({ accepted: false, reason: 'TASK_NOT_OPEN' })
  })
})

describe('humanGateStatus', () => {
  it('keeps a decision valid across revisions that do not touch its inputs', () => {
    const approved = applyHumanTaskCommand(
      complianceApproval,
      { kind: 'approve', actor: 'COMPLIANCE_REVIEWER' },
      current,
    ).task
    const quoteRevision = { ...target, caseRevision: 2 }
    expect(humanGateStatus([approved], quoteRevision, beforeDeadline)).toBe('PASS')
  })

  it('waits while the task is open and passes once approved', () => {
    expect(humanGateStatus([complianceApproval], target, beforeDeadline)).toBe('WAITING_HUMAN')
    const approved = applyHumanTaskCommand(
      complianceApproval,
      { kind: 'approve', actor: 'COMPLIANCE_REVIEWER' },
      current,
    ).task
    expect(humanGateStatus([approved], target, beforeDeadline)).toBe('PASS')
  })

  it('does not reuse an approval after a reroute; the replacement task is pending', () => {
    const approved = applyHumanTaskCommand(
      complianceApproval,
      { kind: 'approve', actor: 'COMPLIANCE_REVIEWER' },
      current,
    ).task
    expect(humanGateStatus([approved], rerouted, beforeDeadline)).toBe('UNKNOWN')

    const { superseded, replacement } = supersedeForNewTarget(approved, {
      humanTaskId: 'HT-3' as HumanTaskId,
      target: rerouted,
      createdAt: beforeDeadline,
      expiresAt: '2026-11-01T16:00:00Z' as UtcTimestamp,
    })
    expect(superseded).toMatchObject({ status: 'SUPERSEDED', supersededBy: 'HT-3' })
    expect(humanGateStatus([superseded, replacement], rerouted, beforeDeadline)).toBe(
      'WAITING_HUMAN',
    )
  })

  it('supersedes an already approved task but never an expired one', () => {
    const approved = applyHumanTaskCommand(
      complianceApproval,
      { kind: 'approve', actor: 'COMPLIANCE_REVIEWER' },
      current,
    ).task
    expect(canBeSuperseded(approved)).toBe(true)
    expect(supersedeTask(approved, 'HT-9' as HumanTaskId)).toMatchObject({
      status: 'SUPERSEDED',
      supersededBy: 'HT-9',
      decision: { outcome: 'APPROVED' },
    })
    const expired = { ...complianceApproval, status: 'EXPIRED' as const }
    expect(canBeSuperseded(expired)).toBe(false)
    expect(() => supersedeTask(expired, 'HT-9' as HumanTaskId)).toThrow()
  })

  it('treats an expired open task as no valid approval', () => {
    expect(humanGateStatus([complianceApproval], target, afterDeadline)).toBe('UNKNOWN')
  })
})
