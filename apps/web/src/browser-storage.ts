import { useState } from 'react'

/**
 * Presenter preferences kept in this browser. Storage can be unavailable (a private window, a
 * blocked site), so every access falls back to the default and the page works without it.
 */
export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`durable-jev:${key}`)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function writeStored(key: string, value: unknown) {
  try {
    if (value === undefined) localStorage.removeItem(`durable-jev:${key}`)
    else localStorage.setItem(`durable-jev:${key}`, JSON.stringify(value))
  } catch {
    // Without storage the preference lasts until the page reloads.
  }
}

export function useStoredState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => readStored(key, fallback))
  const update = (next: T) => {
    writeStored(key, next)
    setValue(next)
  }
  return [value, update] as const
}
