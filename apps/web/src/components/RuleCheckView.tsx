import type { ReactNode } from 'react'
import type { RuleCheck } from '../api'
import { evidenceLabels, moneyOf, roleLabels } from '../labels'
import { Chip, Tags } from './chips'
import { Field, Fields } from './ui'

type Expression = NonNullable<RuleCheck['combiner']>
type Parameters = Record<string, string | number | boolean>

const collectionLabels = { cargoItem: 'item', leg: 'leg' }

/** Shows a parameter's value in the unit its name declares. */
function parameterValue(name: string, value: string | number | boolean): string {
  if (typeof value !== 'number') return String(value)
  if (name.endsWith('Cents')) return moneyOf(value)
  if (name.endsWith('Minutes')) return `${value} minutes`
  if (name.endsWith('Hours')) return `${value} hours`
  return String(value)
}

function threshold(value: number | string, parameters: Parameters): string {
  return typeof value === 'number' ? String(value) : `${parameters[value] ?? '?'} (${value})`
}

interface ExpressionProps {
  expression: Expression
  onOpenRule(ruleId: string): void
}

export function ExpressionLine({ expression, onOpenRule }: ExpressionProps): ReactNode {
  const rule = (ruleId: string) => (
    <Chip onClick={() => onOpenRule(ruleId)} title="Open this rule">
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
      return <>{rule(expression.ruleId)} passes</>
    case 'feel':
      return <code>{expression.expression}</code>
    case 'observed':
      return (
        <>
          the result of {rule(expression.ruleId)}
          {'equals' in expression
            ? ` equals ${String(expression.equals)}`
            : ` includes ${String(expression.includes)}`}
        </>
      )
    case 'and':
      return children('All of these hold:', expression.of)
    case 'or':
      return children('At least one of these holds:', expression.of)
    case 'not':
      return children('This does not hold:', [expression.of])
    case 'ifThen':
      return children('If the first holds, the second must hold too:', [
        expression.condition,
        expression.consequence,
      ])
    case 'allOf':
      return children(`Every ${collectionLabels[expression.scope]} meets:`, [expression.of])
    case 'anyOf':
      return children(`At least one ${collectionLabels[expression.scope]} meets:`, [expression.of])
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
  if ('choiceIn' in passWhen)
    verdict = `Passes when the answer is ${passWhen.choiceIn.join(' or ')}`
  else if ('probabilityAtLeast' in passWhen)
    verdict = `Passes when Jev's confidence that it holds is at least ${threshold(passWhen.probabilityAtLeast, parameters)}`
  else if ('probabilityAtMost' in passWhen)
    verdict = `Passes when Jev's confidence that it holds is at most ${threshold(passWhen.probabilityAtMost, parameters)}`
  else
    verdict = `Every group with confidence of at least ${threshold(passWhen.selectChoicesAtLeast, parameters)} is selected; this rule always passes, and its result picks the specific rules that apply`
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
            {gate.taskType === 'APPROVAL' ? ' approves' : ' completes the operation'}
            {step.appliesWhen && (
              <span className="muted">
                {' '}
                (only when <ExpressionLine expression={step.appliesWhen} onOpenRule={onOpenRule} />)
              </span>
            )}
          </li>
        ))}
      </ol>
      <Fields>
        {gate.steps.length > 1 && (
          <Field label="Order">
            {gate.mode === 'sequential' ? 'One after another' : 'At the same time'}
          </Field>
        )}
        {gate.distinctActors && <Field label="Four eyes">Each step by a different person</Field>}
        {gate.evidenceRequirements.length > 0 && (
          <Field label="Evidence">
            <Tags
              items={gate.evidenceRequirements.map((field) => evidenceLabels[field] ?? field)}
            />
          </Field>
        )}
        <Field label="Expires">After {gate.expiresAfterHours} hours without action</Field>
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
        <Field label="Passes when (FEEL formula)">
          <code className="formula">{check.expression.passWhen}</code>
        </Field>
      )}
      {check.semantic && <SemanticCheck semantic={check.semantic} parameters={parameters} />}
      {check.humanGate && <HumanCheck gate={check.humanGate} onOpenRule={onOpenRule} />}
      {check.combiner && <ExpressionLine expression={check.combiner} onOpenRule={onOpenRule} />}
      {check.mixing && (
        <p>
          Compares the mix of every item's categories in the order with the policy's mixing table: a
          forbidden mix fails, and a mix that needs a qualification checks each leg's carrier for
          it.
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
