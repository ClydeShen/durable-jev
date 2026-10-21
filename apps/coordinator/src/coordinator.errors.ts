export type CoordinatorErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'UNPROCESSABLE'
  | 'NOT_READY_TO_DISPATCH'

export class CoordinatorError extends Error {
  constructor(
    readonly code: CoordinatorErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
  }
}
