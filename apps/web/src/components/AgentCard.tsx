import type { Role } from '@durable-jev/contracts'
import type { RuleOutcome } from '@durable-jev/rule-engine'
import { agentRelations } from '../agent-relations'
import type { AgentNames, AgentStatus, RuleInfo } from '../api'
import { kindLabels, mostSevere, roleLabels } from '../labels'
import { Chip, Drawer, Field, Fields, Section, StatusBadge, Tags } from './ui'

/** What makes these agents durable, as the demo shows it. */
const durableTraits: [string, string][] = [
  [
    '状态不随进程丢失',
    '案例、规则结果、人工任务和事件都存在本 agent 自己的数据库里。进程崩溃后重启，从中断的地方继续；技术评估者角色可以在左侧终止、重启 agent 来演示。',
  ],
  [
    '可以等很久',
    '审批和现场操作是规则图的一部分。等人的时候不占进程，任务有截止时间，过期会重新开出。',
  ],
  [
    '只重算受影响的部分',
    '每个结果都记下它依据的输入。资料变更时只重算受影响的规则，其余结果直接沿用，并标出是哪次变更让结果失效。',
  ],
  ['每一步都有记录', '每个决定都作为事件记下来，时间线里能看到谁、在什么时候、因为什么做了什么。'],
  [
    '模型只提议，不做决定',
    '运输计划的调查助手跑在 Pi Durable 上，每次工具调用都存检查点，崩溃后从检查点继续。它有调用次数和时间上限，只能提出建议，由人确认。',
  ],
]

function peopleOf(rules: readonly RuleInfo[]): Role[] {
  return [
    ...new Set(
      rules.flatMap(
        (rule) => rule.definition.humanGate?.steps.map((step) => step.requiredRole) ?? [],
      ),
    ),
  ]
}

interface Props {
  agent: AgentStatus
  rules: RuleInfo[]
  agentNames: AgentNames
  outcomes: RuleOutcome[]
  onShowRules(): void
  onClose(): void
}

export function AgentCard({ agent, rules, agentNames, outcomes, onShowRules, onClose }: Props) {
  const owned = rules.filter((rule) => rule.owner === agent.agentId)
  const ownedIds = new Set(owned.map((rule) => rule.ruleId))
  const relations = agentRelations(rules)
  const name = (agentId: string) => agentNames[agentId] ?? agentId
  const summary = agent.summary
  return (
    <Drawer
      onClose={onClose}
      heading={
        <>
          <span className={agent.available ? 'dot online' : 'dot offline'} />
          <h3>{agent.card?.name ?? agent.agentId}</h3>
          <span className="tag">Durable Jev Agent</span>
        </>
      }
    >
      <Section title="负责什么">
        <p className="lead">{agent.card?.description}</p>
        <ul className="responsibilities">
          {agent.responsibilities.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Section>
      <Section title={`它的规则（${owned.length} 条）`}>
        <div className="chips">
          {Object.entries(summary?.rulesByKind ?? {}).map(([kind, count]) => (
            <span key={kind} className="tag">
              {kindLabels[kind as keyof typeof kindLabels]} {count}
            </span>
          ))}
        </div>
        <button type="button" className="secondary small spaced" onClick={onShowRules}>
          查看它的规则图
        </button>
      </Section>
      <Section title="和谁协作">
        <Fields>
          <Field label="需要的人">
            <Tags
              items={peopleOf(owned).map((role) => roleLabels[role])}
              empty="无，全部自动判断"
            />
          </Field>
          <Field label="用到谁的结论">
            <Tags
              items={relations
                .filter((relation) => relation.to === agent.agentId)
                .map((relation) => name(relation.from))}
            />
          </Field>
          <Field label="结论交给谁">
            <Tags
              items={relations
                .filter((relation) => relation.from === agent.agentId)
                .map((relation) => name(relation.to))}
            />
          </Field>
        </Fields>
      </Section>
      <Section title="本单">
        <Fields>
          <Field label="它的规则总体">
            <StatusBadge
              status={mostSevere(
                outcomes
                  .filter((outcome) => ownedIds.has(outcome.ruleId))
                  .map((outcome) => outcome.status),
              )}
            />
          </Field>
          <Field label="待办">
            <Tags
              items={Object.entries(summary?.openTasksByRole ?? {}).map(
                ([role, count]) => `${roleLabels[role as Role]} ${count} 件`,
              )}
            />
          </Field>
        </Fields>
      </Section>
      <Section title="运行状态">
        <Fields>
          <Field label="进程">{agent.available ? '在线' : '离线（恢复后会补上错过的评估）'}</Field>
          <Field label="通信方式">
            {agent.transport === 'a2a' ? `A2A（已处理 ${agent.a2aTasks} 个任务）` : '原生 HTTP'}
          </Field>
          {agent.card && agent.agentId !== 'order-coordination' && (
            <Field label="Agent Card">
              <Chip>{agent.card.url}/.well-known/agent-card.json</Chip>
            </Field>
          )}
        </Fields>
      </Section>
      <details className="explainer">
        <summary>什么是 Durable Agent？</summary>
        <dl>
          {durableTraits.map(([title, text]) => (
            <div key={title}>
              <dt>{title}</dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
      </details>
    </Drawer>
  )
}
