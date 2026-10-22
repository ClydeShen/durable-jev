import { context, propagation, type SpanContext, trace } from '@opentelemetry/api'
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import express from 'express'

const spanExporter = new InMemorySpanExporter()
const tracerProvider = new NodeTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(spanExporter)],
})
tracerProvider.register()

const coordinatorTracer = trace.getTracer('shipment-coordinator')
const cargoTracer = trace.getTracer('cargo-assurance')
const correlationId = 'corr-case-1'
const cargoPort = 4821

const cargoAssurance = express()
cargoAssurance.use(express.json())
cargoAssurance.post('/tasks', (request, response) => {
  const incomingContext = propagation.extract(context.active(), request.headers)
  const span = cargoTracer.startSpan(
    'rule.evaluated',
    { attributes: { correlationId, ruleId: 'R03', service: 'cargo-assurance' } },
    incomingContext,
  )
  console.log(`cargo-assurance received traceparent: ${request.headers.traceparent}`)
  span.end()
  response.json({ gateStatus: 'PASS' })
})
const cargoServer = cargoAssurance.listen(cargoPort)

async function dispatchCargoTask(): Promise<SpanContext> {
  return coordinatorTracer.startActiveSpan(
    'task.dispatched',
    { attributes: { correlationId, service: 'shipment-coordinator' } },
    async (span) => {
      const headers: Record<string, string> = { 'content-type': 'application/json' }
      propagation.inject(context.active(), headers)
      await fetch(`http://localhost:${cargoPort}/tasks`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ caseId: 'case-1' }),
      })
      span.end()
      return span.spanContext()
    },
  )
}

function resumeAfterRestart(previousAttempt: SpanContext) {
  const span = coordinatorTracer.startSpan(
    'run.resumed',
    {
      root: true,
      attributes: { correlationId, service: 'shipment-coordinator' },
      links: [{ context: previousAttempt, attributes: { relation: 'resumes' } }],
    },
    context.active(),
  )
  span.end()
}

try {
  const firstAttempt = await dispatchCargoTask()
  resumeAfterRestart(firstAttempt)
  for (const span of spanExporter.getFinishedSpans()) {
    console.log(
      JSON.stringify({
        name: span.name,
        service: span.attributes.service,
        correlationId: span.attributes.correlationId,
        traceId: span.spanContext().traceId,
        spanId: span.spanContext().spanId,
        parentSpanId: span.parentSpanContext?.spanId,
        links: span.links.map((link) => link.context.spanId),
      }),
    )
  }
} finally {
  cargoServer.close()
  await tracerProvider.shutdown()
}
