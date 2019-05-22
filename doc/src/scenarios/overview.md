# Scenarios

A scenario is an abstract representation of an example interaction involving one or more Holochain instances. A scenario, at its essence, is a simple function of two parameters that returns a `Promise`. Here's its basic form:

```javascript
async (s, instances) => { /* test goes here */ }
```

Before describing what these two parameters are, let's also look at an example of a realistic scenario:

```javascript
async (s, {alice, bob}) => {
    // call a zome function on the first instance which 
    // commits an entry and creates a link
    const hash = await alice.call('blog', 'create_post', { content: 'hi' })

    // wait for all side-effects to have occurred
    await s.consistent()

    // call a zome function on the other instance which gets links
    // (note that without waiting for consistency, 
    // this may fail nondeterministically)
    const result = await bob.call('blog', 'get_posts')

    // make an assertion (keep reading to learn 
    // how to integrate with unit test frameworks)
    if (!result.Ok) { throw "could not get blog posts!" }
}
```

Let's look at the parameters of this scenario-defining function:

The first parameter, `s` is the Scenario API. It has a lot of room for growth. Currently it contains a single method, `consistent()`, which returns a Promise that resolves once all side-effects from all previous steps have been processed, and it is safe to assume that the network is in a consistent state.

> <i class="fa fa-clipboard"></i> 
> "Network consistency" is a highly context-dependent concept. In a full-sync network, consistency is achieved when all nodes are holding all entries. In other network topologies though, there is no clear definition. With Orchestrators, various network topologies can be modeled, and with those variations, the Scenario API will be enriched to allow waiting for certain nuanced notions of consistency.

The second parameter, `instances`, is the collection of running instances which will take part in this scenario test, usually an object with keys corresponding to friendly names for the instances. In the example, we destructured this object into `{alice, bob}` so we could immediately use them.

Each instance has a simple interface including: 
* `call()`, for zome calls
* `agentAddress`, to get the agent public key for this instance
* `dnaAddress`, to get the DNA hash for this instance

The Orchestrator upon which this Scenario runs is responsible for injecting values into both of these parameters. By specifying scenarios in this way, we can run them on a variety of Orchestrators.

