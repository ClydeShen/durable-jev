import type { CheckStatus } from '@durable-jev/contracts'

/** One line of a graph legend: a colour or mark, its short name, and what it means for the order. */
interface LegendEntry {
  /** A status colour, or one of the highlight colours. */
  colour: CheckStatus | 'upstream' | 'downstream'
  name: string
  meaning: string
}

export interface Legend {
  /** Shown in the small strip on the graph. */
  entries: LegendEntry[]
  /** Shown with the entries when the legend opens: marks and lines that are not a colour. */
  notes: { mark: string; meaning: string }[]
}

const statusEntries: LegendEntry[] = [
  { colour: 'PASS', name: '通过', meaning: '检查过了，没有问题。' },
  { colour: 'FAIL', name: '不通过', meaning: '发现问题，订单不能往下走，要改资料。' },
  {
    colour: 'WAITING_HUMAN',
    name: '等人处理',
    meaning: '需要有人确认、签字或到现场操作，等对应的角色处理。',
  },
  {
    colour: 'BLOCKED_DEPENDENCY',
    name: '等前面的规则',
    meaning: '它要用的结论还没出来，前面的规则有结果后才判断。',
  },
  {
    colour: 'INVALIDATED',
    name: '失效重算',
    meaning: '订单资料变了，旧结论作废，正按新资料重新判断。',
  },
  { colour: 'UNKNOWN', name: '未知', meaning: '资料不够，暂时判断不了。' },
]

export const ruleLegend: Legend = {
  entries: [
    ...statusEntries,
    { colour: 'upstream', name: '上游', meaning: '点选一条规则时：它要先等的规则。' },
    { colour: 'downstream', name: '下游', meaning: '点选一条规则时：用它结论的规则。' },
  ],
  notes: [
    {
      mark: '↻ r2',
      meaning:
        '订单资料改到第 2 版后，这条规则重新判断过。改版后没有这个标记的规则，沿用了上次的结论。',
    },
    { mark: '等 + 角色', meaning: '这条规则正在等这个角色处理。' },
    { mark: '灰色方块', meaning: '这一单用不上这条规则（不适用），或者还没轮到它。' },
    { mark: '虚线方块', meaning: '只看一个 agent 时，它要用到的别的 agent 的规则。' },
    { mark: '流动的连线', meaning: '回放或点选时，结论正沿着这条线传给下一条规则。' },
  ],
}

export const agentLegend: Legend = {
  entries: statusEntries.filter((entry) => entry.colour !== 'BLOCKED_DEPENDENCY'),
  notes: [
    { mark: '卡片边框', meaning: '这个 agent 在本单中最需要关注的状态。' },
    { mark: '箭头', meaning: '一个 agent 的规则用到另一个 agent 的结论，旁边的数字是用到几条。' },
  ],
}
