import type { ReactNode } from 'react'
import type { RuleCheck } from '../api'
import { evidenceLabels, roleLabels } from '../labels'
import { Chip, Tags } from './chips'
import { Field, Fields } from './ui'

type Expression = NonNullable<RuleCheck['combiner']>
type Parameters = Record<string, string | number | boolean>

const collectionLabels = { cargoItem: '货物', leg: '运输段' }

/** Shows a parameter's value in the unit its name declares. */
function parameterValue(name: string, value: string | number | boolean): string {
  if (typeof value !== 'number') return String(value)
  if (name.endsWith('Cents')) return `€${(value / 100).toLocaleString('zh-CN')}`
  if (name.endsWith('Minutes')) return `${value} 分钟`
  if (name.endsWith('Hours')) return `${value} 小时`
  return String(value)
}

function threshold(value: number | string, parameters: Parameters): string {
  return typeof value === 'number' ? String(value) : `${parameters[value] ?? '?'}（${value}）`
}

interface ExpressionProps {
  expression: Expression
  onOpenRule(ruleId: string): void
}

export function ExpressionLine({ expression, onOpenRule }: ExpressionProps): ReactNode {
  const rule = (ruleId: string) => (
    <Chip onClick={() => onOpenRule(ruleId)} title="查看这条规则">
      {ruleId}
    </Chip>
  )
  const children = (label: string, of: readonly Expression[]) => (
    <>
      {label}
      <ul className="expression">
        {of.map((child) => (
          <li key={JSON.stringify(child)}>
            <ExpressionLine expression={child} onOpenRule={onOpenRule} />
          </li>
        ))}
      </ul>
    </>
  )
  switch (expression.op) {
    case 'ref':
      return <>{rule(expression.ruleId)} 通过</>
    case 'feel':
      return <code>{expression.expression}</code>
    case 'observed':
      return (
        <>
          {rule(expression.ruleId)} 的结果
          {'equals' in expression
            ? ` 等于 ${String(expression.equals)}`
            : ` 包含 ${String(expression.includes)}`}
        </>
      )
    case 'and':
      return children('以下全部满足：', expression.of)
    case 'or':
      return children('以下至少一项满足：', expression.of)
    case 'not':
      return children('以下不成立：', [expression.of])
    case 'ifThen':
      return children('如果第一项成立，则第二项也须成立：', [
        expression.condition,
        expression.consequence,
      ])
    case 'allOf':
      return children(`每个${collectionLabels[expression.scope]}都满足：`, [expression.of])
    case 'anyOf':
      return children(`至少一个${collectionLabels[expression.scope]}满足：`, [expression.of])
  }
}

function SemanticCheck({
  semantic,
  parameters,
}: {
  semantic: NonNullable<RuleCheck['semantic']>
  parameters: Parameters
}) {
  const { question, passWhen } = semantic
  let verdict: string
  if ('choiceIn' in passWhen) verdict = `回答是 ${passWhen.choiceIn.join(' 或 ')} 时通过`
  else if ('probabilityAtLeast' in passWhen)
    verdict = `Jev 判断"成立"的把握 ≥ ${threshold(passWhen.probabilityAtLeast, parameters)} 时通过`
  else if ('probabilityAtMost' in passWhen)
    verdict = `Jev 判断"成立"的把握 ≤ ${threshold(passWhen.probabilityAtMost, parameters)} 时通过`
  else
    verdict = `把握 ≥ ${threshold(passWhen.selectChoicesAtLeast, parameters)} 的类别都选中；这条规则总是通过，它的结论用来挑选适用的扩展规则`
  return (
    <>
      <blockquote className="question">{question.text}</blockquote>
      {question.kind === 'choice' && (
        <ul className="options">
          {Object.entries(question.options).map(([option, text]) => (
            <li key={option}>
              <Chip>{option}</Chip> {text}
            </li>
          ))}
        </ul>
      )}
      <p>{verdict}</p>
    </>
  )
}

function HumanCheck({
  gate,
  onOpenRule,
}: {
  gate: NonNullable<RuleCheck['humanGate']>
  onOpenRule(ruleId: string): void
}) {
  return (
    <>
      <ol className="gate-steps">
        {gate.steps.map((step) => (
          <li key={step.requiredRole}>
            {roleLabels[step.requiredRole]}
            {gate.taskType === 'APPROVAL' ? '批准' : '完成操作'}
            {step.appliesWhen && (
              <span className="muted">
                {' '}
                （仅当 <ExpressionLine expression={step.appliesWhen} onOpenRule={onOpenRule} />）
              </span>
            )}
          </li>
        ))}
      </ol>
      <Fields>
        {gate.steps.length > 1 && (
          <Field label="顺序">{gate.mode === 'sequential' ? '依次进行' : '同时进行'}</Field>
        )}
        {gate.distinctActors && <Field label="四眼原则">每一步必须由不同的人完成</Field>}
        {gate.evidenceRequirements.length > 0 && (
          <Field label="需要填写">
            <Tags
              items={gate.evidenceRequirements.map((field) => evidenceLabels[field] ?? field)}
            />
          </Field>
        )}
        <Field label="有效期">{gate.expiresAfterHours} 小时内未处理即过期</Field>
      </Fields>
    </>
  )
}

interface Props {
  check: RuleCheck
  parameters: Parameters
  onOpenRule(ruleId: string): void
}

/** How a rule decides, in words: its formula, its question to Jev, its approvers or its parts. */
export function RuleCheckView({ check, parameters, onOpenRule }: Props) {
  return (
    <>
      {check.expression && (
        <Field label="通过条件（FEEL 公式）">
          <code className="formula">{check.expression.passWhen}</code>
        </Field>
      )}
      {check.semantic && <SemanticCheck semantic={check.semantic} parameters={parameters} />}
      {check.humanGate && <HumanCheck gate={check.humanGate} onOpenRule={onOpenRule} />}
      {check.combiner && <ExpressionLine expression={check.combiner} onOpenRule={onOpenRule} />}
      {check.mixing && (
        <p>
          把整单所有货物的类别组合，与政策里的混装表比对：禁止的组合不通过，需要资质的组合检查每个运输段的承运商资质。
        </p>
      )}
      {Object.keys(parameters).length > 0 && (
        <Fields>
          {Object.entries(parameters).map(([name, value]) => (
            <Field key={name} label={name}>
              {parameterValue(name, value)}
            </Field>
          ))}
        </Fields>
      )}
    </>
  )
}
