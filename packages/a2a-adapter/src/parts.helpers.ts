import type { Message, Part } from '@a2a-js/sdk'

export const dataPart = (value: unknown): Part => {
  return {
    content: { $case: 'data', value },
    metadata: undefined,
    filename: '',
    mediaType: 'application/json',
  } as Part
}

export const readData = (parts: readonly Part[]): Record<string, unknown> => {
  return Object.assign(
    {},
    ...parts.flatMap((part) => (part.content?.$case === 'data' ? [part.content.value] : [])),
  )
}

export const readMessageData = (message: Message) => readData(message.parts)
