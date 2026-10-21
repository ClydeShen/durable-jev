import { spawn } from 'node:child_process'

// Best effort: on a machine without a desktop (a container, a server) nothing opens and the
// address printed above is all there is.
export const openInBrowser = (url: string, platform: string = process.platform): void => {
  const [command, args]: [string, string[]] =
    platform === 'darwin'
      ? ['open', [url]]
      : platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]]
  const child = spawn(command, args, { stdio: 'ignore', detached: true })
  child.on('error', () => {})
  child.unref()
}
