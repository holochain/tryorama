# Scenario suites

A developer will typically write an entire suite of scenario tests. The difference here is that the tests are written for multiple orchestrators, rather than a single test harness like tape or mocha.

## Defining scenarios

When writing scenarios, we don't want them to be run immediately, but rather specified as a collection of closures to be run on orchestrators later. Here's one way to do this which won't look too foreign to an experience JS unit tester:

```js
//////////////////////////////
/// file: test-plain.js

// export a function for which we can inject the proper test runner
export default scenario => {
	scenario("test something", async (s, {alice, bob}) => {
	    assert(alice.agentId === 'alice')
	})

	scenario("test something harder", async (s, {alice, bob}) => {
	    alice.call("blog", "create_post", {content: "hi"})
	    await s.consistency()
	    const result = bob.call("blog", "get_posts")
	    assert(result.Ok)
	})
}
```
```js
//////////////////////////////
/// file: run-local.js

// create a test runner that gets injected into the defined scenarios
const runner = LocalOrchestrator({config: 'goes here'})
require('./test-plain')(runner)
```
```js
//////////////////////////////
/// file: run-emulation.js

// run the same tests but with a different orchestrator
export default runner = EmulationOrchestrator({otherConfig: 'goes here'})
require('./test-plain')(runner)
```
