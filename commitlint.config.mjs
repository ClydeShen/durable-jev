// Commit messages follow Conventional Commits. The scope names the workspace package that changed
// (its folder name) or one of the cross-cutting areas below, so history says what each commit touched.
import { readdirSync } from 'node:fs'

const workspaces = ['packages', 'apps', 'tools'].flatMap((group) =>
  readdirSync(new URL(`./${group}/`, import.meta.url)),
)
const crossCutting = ['eval', 'rules', 'harness', 'faults', 'lint', 'types', 'deps', 'ci']

export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'build',
        'chore',
        'ci',
        'docs',
        'feat',
        'fix',
        'perf',
        'refactor',
        'revert',
        'style',
        'test',
        'tune',
      ],
    ],
    'scope-enum': [2, 'always', [...workspaces, ...crossCutting]],
  },
}
