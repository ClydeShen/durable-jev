import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sourceFiles(join(directory, entry.name))
      : /\.(tsx?|css)$/.test(entry.name)
        ? [join(directory, entry.name)]
        : [],
  )

describe('icon system', () => {
  it('keeps symbol characters out of the UI source: use an icon from icons.tsx', () => {
    const offenders = sourceFiles(import.meta.dirname).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, index) =>
          /[^\x00-\x7F]/.test(line) ? [`${file}:${index + 1}: ${line.trim()}`] : [],
        ),
    )
    expect(offenders).toEqual([])
  })
})
