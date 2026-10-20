export type FaultResult = { passed: boolean; observations: string[] }

export type FaultScenario = {
  id: string
  title: string
  expectation: string
  // Where the evidence lives besides this run, e.g. a test or a later task.
  notes?: string
  run(): Promise<FaultResult>
}

// Collects what a scenario observed; the scenario passes only if every check held.
export class Observations {
  private readonly lines: string[] = []
  private failed = false

  check(condition: boolean, description: string): boolean {
    this.lines.push(`${condition ? 'ok' : 'FAILED'}: ${description}`)
    if (!condition) this.failed = true
    return condition
  }

  note(description: string): void {
    this.lines.push(`note: ${description}`)
  }

  result(): FaultResult {
    return { passed: !this.failed, observations: [...this.lines] }
  }
}
