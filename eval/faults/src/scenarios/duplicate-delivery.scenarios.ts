import { mkdtempSync, rmSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  A2aCallError,
  A2aTaskLinks,
  a2aBranchEvaluator,
  a2aClientMigrations,
  a2aServerMigrations,
  branchAgentCard,
  evaluationExecutor,
  mountA2a,
} from '@durable-jev/a2a-adapter'
import { loadCase } from '@durable-jev/eval-runner'
import { getOperationStatus, openDatabase } from '@durable-jev/store'
import {
  ensurePlanReservation,
  reservationMigrations,
  reservationOperationId,
} from '@durable-jev/transport-reservations'
import express from 'express'
import { type FaultScenario, Observations } from '../fault.types.js'
import { runScript } from '../faults.fixture.js'

export const f02: FaultScenario = {
  id: 'F02',
  title: 'Write succeeded, process killed before the response',
  expectation: 'The operation id confirms the write; retrying does not write twice',
  async run() {
    const seen = new Observations()
    const directory = mkdtempSync(join(tmpdir(), 'fault-f02-'))
    const databasePath = join(directory, 'reservations.sqlite')
    try {
      const crashed = runScript('eval/faults/src/scenarios/write-then-crash.ts', [databasePath])
      seen.check(
        crashed.exitCode === 137,
        'the reserving process died after writing, before answering',
      )
      const database = openDatabase(databasePath, reservationMigrations)
      const shipment = loadCase('LOG-001').shipment
      const status = getOperationStatus(database, reservationOperationId(shipment))
      seen.check(status.status === 'APPLIED', 'the operation id shows the reservation was applied')
      const ready = ensurePlanReservation(database, shipment)
      const rows = database.prepare('SELECT COUNT(*) AS count FROM reservations').get() as {
        count: number
      }
      seen.check(ready, 'the retried plan check finds an active reservation for every leg')
      seen.check(
        rows.count === shipment.legs.length,
        `exactly ${shipment.legs.length} reservation row(s) after the retry`,
      )
      database.close()
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
    return seen.result()
  },
}

export const f04: FaultScenario = {
  id: 'F04',
  title: 'A2A request received, client timed out and retried',
  expectation: 'The idempotent mapping returns the original task; nothing is delegated twice',
  async run() {
    const seen = new Observations()
    let executions = 0
    const app = express()
    const server = app.listen(0)
    await new Promise((ready) => server.once('listening', ready))
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    mountA2a(app, {
      card: branchAgentCard({
        serviceName: 'commercial-control',
        branches: ['commercial'],
        baseUrl,
      }),
      // Slower than the client's patience: the client gives up, the service finishes anyway.
      executor: evaluationExecutor(async () => {
        executions += 1
        await new Promise((wait) => setTimeout(wait, 400))
        return { evaluations: [], humanGateRequests: [] }
      }),
      database: openDatabase(':memory:', a2aServerMigrations),
    })
    try {
      const links = new A2aTaskLinks(openDatabase(':memory:', a2aClientMigrations))
      const caseFile = loadCase('LOG-001')
      const request = {
        caseId: caseFile.shipment.caseId,
        caseRevision: 1,
        shipment: caseFile.shipment,
        evidence: caseFile.evidence,
        semanticAnswers: [],
        upstreamResults: [],
        humanGates: [],
      }
      const impatient = a2aBranchEvaluator(
        'commercial-control',
        ['commercial'],
        baseUrl,
        links,
        100,
      )
      const first = await impatient.evaluate(request).catch((error) => error)
      seen.check(first instanceof A2aCallError, 'the first call timed out on the client')
      await new Promise((wait) => setTimeout(wait, 600))
      const patient = a2aBranchEvaluator('commercial-control', ['commercial'], baseUrl, links)
      await patient.evaluate(request)
      seen.check(executions === 1, `the service evaluated once (executions: ${executions})`)
      const [link] = links.forCase(request.caseId)
      seen.check(
        link?.state === 'TASK_STATE_COMPLETED',
        'the mapping now holds the original, completed task',
      )
    } finally {
      server.close()
    }
    return seen.result()
  },
}
