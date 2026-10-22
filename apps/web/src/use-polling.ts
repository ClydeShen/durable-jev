import { useCallback, useEffect, useState } from 'react'

export function usePolling<T>(load: () => Promise<T>, intervalMs = 2000) {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<string>()
  const refresh = useCallback(async () => {
    try {
      setData(await load())
      setError(undefined)
    } catch (failure) {
      setError(String(failure))
    }
  }, [load])
  useEffect(() => {
    void refresh()
    const timer = setInterval(refresh, intervalMs)
    return () => clearInterval(timer)
  }, [refresh, intervalMs])
  return { data, error, refresh }
}
