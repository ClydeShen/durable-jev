export class InvalidTransitionError extends Error {
  constructor(
    readonly machine: string,
    readonly from: string,
    readonly to: string,
  ) {
    super(`${machine}: cannot move from ${from} to ${to}`)
  }
}

export type StateMachine<State extends string> = {
  name: string
  initial: State
  states: readonly State[]
  terminalStates: readonly State[]
  isTerminal(state: State): boolean
  canTransition(from: State, to: State): boolean
  transition(from: State, to: State): State
}

export function defineStateMachine<State extends string>(definition: {
  name: string
  initial: State
  transitions: Readonly<Record<State, readonly State[]>>
}): StateMachine<State> {
  const states = Object.keys(definition.transitions) as State[]
  const terminalStates = states.filter((state) => definition.transitions[state].length === 0)
  const canTransition = (from: State, to: State) =>
    from === to || definition.transitions[from].includes(to)
  return {
    name: definition.name,
    initial: definition.initial,
    states,
    terminalStates,
    isTerminal: (state) => terminalStates.includes(state),
    canTransition,
    transition(from, to) {
      if (!canTransition(from, to)) throw new InvalidTransitionError(definition.name, from, to)
      return to
    },
  }
}
