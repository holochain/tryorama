# Integrating other testing frameworks and tools

Often we will want to use a testing framework like `tape` to help us write assertions and actually give us a proper testing environment. To integrate this with the above method of writing scenarios, we can use combinators to provide a different interface for writing scenarios.

Here's a handy combinator that can make our scenarios aware of just about any testing framework:

```js
/////////////////////////////
/// file: combinators.js

/**
 * Combinator which injects an extra object into the 
 * scenario definition as the second parameter.
 * 
 * e.g. the invocation of a scenario goes from
 *
 *     scenario("description", (s, instances) => { <test goes here> })
 *
 * to
 *
 *     scenario("description", (s, harness, instances) => { <test goes here> })
 */
export const withHarness = harness => run => async (desc, g) => {
    // inject `harness` as the second parameter
    const f = (s, instances) => g(s, harness, instances)
    return run(desc, f)
}
```

With this `withHarness` combinator in hand, we can modify our test runner from the orchestrator:

```js
//////////////////////////////
/// file: run-local.js

import {withHarness} from './combinators'

// create a test runner as usual
const runner = LocalOrchestrator({config: 'goes here'})

// create a decorator that injects `tape` into each scenario as the 2nd argument
const withTape = withHarness(require('tape'))

// create a special runner that understands how to use 
// three arguments instead of two in the closure
const tapeRunner = withTape(runner)

// inject the modified runner into the tape-aware scenario definitions
require('./test-tape')(tapeRunner)
```

And with this modified test runner, we can write our scenarios differently, accepting an extra parameter which expects the specified harness (in this case `tape`) to be injected.

```js
//////////////////////////////
/// file: test-tape.js

export default scenario => {
    // note the extra `t` parameter here, this will be a 
    // `tape` object provided by `withTape`
    scenario("test something", async (s, t, {alice, bob}) => {
        t.equal(alice.agentId, 'alice')
    })
}
```
