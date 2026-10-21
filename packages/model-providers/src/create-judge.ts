import { JevJudge } from './jev-judge.js'
import { ScriptedJudge, type ScriptedJudgement } from './scripted-judge.js'
import type { SemanticJudge } from './semantic-judge.js'
import { StructuredOutputJudge } from './structured-output-judge.js'

export type ModelMode = 'scripted' | 'live'
export type LiveProvider = 'jev' | 'structured-output'

export interface CreateSemanticJudgeOptions {
  mode: ModelMode
  provider: LiveProvider
  script?: readonly ScriptedJudgement[]
}

export function modelModeFromEnv(env: NodeJS.ProcessEnv = process.env): ModelMode {
  const mode = env.MODEL_MODE ?? 'scripted'
  if (mode !== 'scripted' && mode !== 'live') {
    throw new Error(`MODEL_MODE must be scripted or live, got ${mode}`)
  }
  return mode
}

export function createSemanticJudge(options: CreateSemanticJudgeOptions): SemanticJudge {
  if (options.mode === 'scripted') return new ScriptedJudge(options.script ?? [])
  return options.provider === 'jev' ? new JevJudge() : new StructuredOutputJudge()
}
