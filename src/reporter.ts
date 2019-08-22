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
${errors.length} errors:
\t${errors.join('\n\t')}
`)
  },
})
