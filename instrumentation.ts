import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'
import { Resource } from '@opentelemetry/resources'
import { LoggerProvider, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs'

export function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const key = process.env.POSTHOG_KEY
    if (!key) return

    const exporter = new OTLPLogExporter({
      url: 'https://us.i.posthog.com/otlp/v1/logs',
      headers: {
        Authorization: `Bearer ${key}`,
      },
    })

    const loggerProvider = new LoggerProvider({
      resource: new Resource({ 'service.name': 'jobtide' }),
    })

    loggerProvider.addLogRecordProcessor(new SimpleLogRecordProcessor(exporter))

    ;(globalThis as Record<string, unknown>).__posthogLogger = loggerProvider.getLogger('jobtide')
  }
}
