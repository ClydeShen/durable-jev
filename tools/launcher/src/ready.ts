import { spawn } from 'node:child_process'

/** Resolves once the console answers with the demo cases, so the URL is printed when it works. */
export async function waitUntilReady(url: string, timeoutMs = 60_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/api/cases`)
      if (response.ok && ((await response.json()) as unknown[]).length > 0) return true
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return false
}

const colour = process.stdout.isTTY && !process.env.NO_COLOR
const paint = (code: string, text: string) => (colour ? `\u001b[${code}m${text}\u001b[0m` : text)

/** The line a presenter looks for in the log: where the demo is and how it runs. */
export function readyBanner(url: string, modelMode: string): string {
  return [
    '',
    paint('1;32', '  ✔ Durable Jev 演示已就绪'),
    '',
    `  ➜  打开   ${paint('1;36', url)}`,
    `     模型   ${modelMode}`,
    `     停止   Ctrl+C`,
    '',
    '',
  ].join('\n')
}

/** Opens the console in the default browser; OPEN_BROWSER=false turns this off. */
export function openBrowser(url: string): void {
  if (process.env.OPEN_BROWSER === 'false') return
  const [command, args] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : [process.platform === 'darwin' ? 'open' : 'xdg-open', [url]]
  const child = spawn(command, args, { stdio: 'ignore', detached: true })
  // Without a browser (a server, a container) the URL in the banner is enough.
  child.on('error', () => undefined)
  child.unref()
}
