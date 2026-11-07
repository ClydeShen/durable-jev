import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = process.argv[2] ?? fileURLToPath(new URL('../docs/', import.meta.url))
const read = (name) => readFileSync(join(directory, name), 'utf8').replaceAll('\r\n', '\n')
const hash = (value) => createHash('sha256').update(value).digest('hex')
const json = (value) => JSON.stringify(value, null, 2)
const nonempty = (value) => assert.ok(typeof value === 'string' && value.trim().length > 0)

function verifyResponse(sample, response) {
  assert.deepEqual(Object.keys(response).sort(), [
    'decision',
    'facts',
    'limitations',
    'nextActions',
    'summary',
    'unresolved',
  ])
  for (const key of ['summary', 'decision']) nonempty(response[key])
  for (const key of ['facts', 'unresolved', 'nextActions', 'limitations']) {
    assert.ok(Array.isArray(response[key]) && response[key].length > 0, `missing ${key}`)
  }
  const ids = new Set(sample.evidence.map((entry) => entry.id))
  for (const fact of response.facts) {
    nonempty(fact.claim)
    assert.ok(Array.isArray(fact.sources) && fact.sources.length > 0)
    for (const source of fact.sources) assert.ok(ids.has(source), `unknown citation ${source}`)
  }
  for (const value of [...response.unresolved, ...response.limitations]) nonempty(value)
  const actions = new Map(
    sample.availableActions.map((action) => {
      const [signature] = action.split(':')
      const [name, args] = signature.replace(')', '').split('(')
      return [
        name,
        args
          .split(',')
          .map((arg) => arg.trim())
          .sort(),
      ]
    }),
  )
  for (const action of response.nextActions) {
    assert.ok(actions.has(action.tool), `unknown action ${action.tool}`)
    assert.deepEqual(Object.keys(action.args).sort(), actions.get(action.tool))
    nonempty(action.reason)
    if (action.args.evidenceIds) {
      for (const id of action.args.evidenceIds)
        assert.ok(ids.has(id), `unknown action citation ${id}`)
    }
  }
}

const manifest = JSON.parse(read('open-question-manifest.json'))
assert.equal(hash(read('open-question-pilot.json')), manifest.planSha256, 'plan changed')
assert.equal(hash(read('open-question-results.json')), manifest.resultsSha256, 'results changed')
const plan = JSON.parse(read('open-question-pilot.json'))
const results = JSON.parse(read('open-question-results.json'))
assert.equal(plan.cases.length, 3)
assert.deepEqual(
  results.observations.map((row) => row.id),
  plan.cases.map((row) => row.id),
)
assert.deepEqual(
  manifest.trials.map((row) => row.id),
  plan.cases.map((row) => row.id),
)
for (const [index, sample] of plan.cases.entries()) {
  const { reviewCriteria, ...input } = sample
  assert.ok(reviewCriteria.length > 0)
  const prompt = `${plan.instructions}\n\n${json(input)}`
  assert.equal(hash(prompt), manifest.trials[index].promptSha256, 'prompt changed')
  verifyResponse(sample, results.observations[index].response)
}
process.stdout.write(
  '3 archived trials: hashes, response structure, citation IDs and action signatures verified.\nSemantic correctness, clean-context enforcement and runtime execution require separate evidence.\n',
)
