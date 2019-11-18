const _ = require('lodash')
import { TestStats } from "./orchestrator";

const noop = (..._x) => { }

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
  before: total => log(`(tryorama)  Running ${total} scenarios`),
  each: desc => log(`τ  ${desc}`),
  after: ({ successes, errors }) => {
    const total = successes + errors.length
    log(`(tryorama)  Orchestrator test run complete:
${total} total scenarios
${successes} successes
${errors.length > 0 ? `${errors.length} errors:` : '0 errors'}
\t${errors.map(formatError).join('\n\t')}
`)
  },
})

const formatError = ({ description, error }) => {
  if (error instanceof Error) {
    error = error.toString()
  } else if (_.isObject(error)) {
    error = JSON.stringify(error, null, 2)
  }
  return `( ${description} ): ${error}`
}
