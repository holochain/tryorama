import logger from "./logger";
import { TestStats } from "./orchestrator";

const noop = (...x) => { }

export type Reporter = {
  before: (total: number) => void,
  after: (stats: TestStats) => void,
  each: (description: string) => void,
}

export const unit = ({
  before: noop,
  each: noop,
  after: noop,
})

export const basic = log => ({
  before: total => log(`(try-o-rama)  Running ${total} scenarios`),
  each: desc => log(`τ  ${desc}`),
  after: ({ successes, errors }) => {
    const total = successes + errors.length
    log(`(try-o-rama)  Orchestrator test run complete:
${total} total scenarios
${successes} successes
${errors.length > 0 ? `${errors.length} errors:` : '0 errors'}
\t${errors.map(formatError).join('\n\t')}
`)
  },
})

const formatError = e => {
  if (e.error instanceof Error) {
    e.error = e.error.toString()
  } else if (e.error instanceof Object) {
    e.error = JSON.stringify(e.error, null, 2)
  }
  return e
}