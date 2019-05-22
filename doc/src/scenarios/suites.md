# Test suites

> <i class="fa fa-exclamation-triangle"></i> 
> Still working out how test suites will be built, but this is the basic idea

A developer will typically write an entire suite of scenario tests. A collection of independent Scenarios can be specified, similar to how tests are specified in other common test frameworks. The difference here is that the tests are written for multiple orchestrators, rather than a single test harness like tape or mocha. So, the suite will consist of a collection of Scenarios, but these will not be executed immediately.

## Defining scenarios


When writing scenarios, we don't want them to be run immediately, but rather specified as a collection of closures to be run on orchestrators later. Here's one way to do this which won't look too foreign to an experience JS unit tester:

```js
//////////////////////////////
/// file: test-plain.js

// export a function for which we can inject the proper test runner
export default scenario => {
	scenario("test something", run => run(async (s, {alice, bob}) => {
	    assert(alice.agentAddress === 'alice')
	}))

	scenario("test something harder", run => run(async (s, {alice, bob}) => {
	    alice.call("blog", "create_post", {content: "hi"})
	    await s.consistency()
	    const result = bob.call("blog", "get_posts")
	    assert(result.Ok)
	}))
}
```

The `scenario` parameter specified here is a function that can be injected, which will register these scenarios with an Orchestrator. This is what allows running on multiple Orchestrators. This function takes a string as a description of the test, as well as a function which runs the actual scenario.

The extra layer of wrapping in a `run` function is necessary for more advanced cases, for instance integrating with a test framework like `tape`, where we need fine-grained control over when the scenario actually gets executed.

With such a module of scenarios defined, we can now easily run it on a variety of Orchestrators:

```js
//////////////////////////////
/// file: run-local.js

// create a test runner that gets injected into the defined scenarios
const runner = LocalOrchestrator({config: 'goes here'})
require('./test-plain')(runner.registerScenario)
runner.runSuite()
```
```js
//////////////////////////////
/// file: run-emulation.js

// run the same tests but with a different orchestrator
export default runner = EmulationOrchestrator({otherConfig: 'goes here'})
require('./test-plain')(runner.registerScenario)
runner.runSuite()
```
