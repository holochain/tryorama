# Scenario Syntax Exploration

This is an exploration of various possible syntaxes for defining testing Scenarios.


### Syntax A

* Focused on only invoking a Waiter if necessary
* Explicitly declare scopes in which to wait, using `s.consistency`
    * In such a scope, all instance `.call` methods return Promises which can be `await`ed, rather than immediately returning their values like usual
* Potentially allows very fine-grained waiting, since waiting is specified at the level of individual zome calls

```js
scenario("description", async (s, {alice, bob}) => {

    // Make a zome function call (no waiting)
    const posts = alice.call('blog/get_posts', {})
    // Make an assertion about the returned value
    assert(posts.length === 0)

    // Enter a scope which is backed by a Waiter, and where each `call()`
    // is converted to return a Promise that can be awaited
    await s.consistency(({alice, bob}) => {
        const hash = await alice.call('blog/create_post', {
            content: 'whatever'
        })
        const posts = await bob.call('blog/get_posts', {})
        assert(hash === posts[0])
    })
    s.done() // optional if the function returns a Promise (is async)
})
```


### Syntax B

* The Waiter is always running, and the test can use it as a cue to wait for total consistency between certain nodes
* `s.consistent()` (without arguments) returns a Promise that resolves only when all instances have reached consistency (if possible under the network topology)
    * In terms of Waiter, this means that no instance is waiting to observe any action
* `s.consistent(alice, bob)` (with arguments) returns a Promise that resolves when Alice and Bob are mutually consistent
    * "mutually consistent" means that Alice is no longer awaiting any actions which were triggered by Bob, and vice-versa
        * If it turns out to be necessary for this to expressed asymmetrically (i.e. only wait for Alice to be done waiting for Bob, but not vice-versa), the syntax will have to be expanded
    * This implies that the Waiter needs to keep track of the *cause* of each awaited action; it needs to know which instance caused other instances to await an action

```js
scenario("description", async (s, {alice, bob}) => {

    // Make a zome function call (no waiting)...
    const posts = alice.call('blog/get_posts', {})
    // ...and make an assertion about the returned value
    assert(posts.length === 0)

    // Commit an entry. This opens up the door for inconsistency...
    const hash = alice.call('blog/create_post', { content: 'whatever' })

    // ...so, wait for mutual consistency, so that later...
    await s.consistent([alice, bob])

    // ...Bob can check that he saw Alice's post with certainty
    const posts = bob.call('blog/get_posts', {})
    assert(hash === posts[0])

    s.done() // optional if the function returns a Promise (is async)
})
```

- - -

## Comparison of Syntaxes

* Syntax A possibly allows more fine-grained control over waiting, and doesn't require a waiter to be running for the whole test
* Syntax B seems more convenient, but potentially with less fine-grained control -- it can only wait for certain parts of the Waiter to spill out and empty completely

# Further considerations

* We'll eventually have a test conductor that can be ticked manually. What will that mean for `s`, and the different non-happy-path scenarios that can be specified?
* We want the right balance of generality and specific targeting to each orchestrator.
    * The local-only orchestrator should focus on speed, letting the app dev rip through scenario tests as part of the dev cycle
    * The fully networked orchestrator can be less fast, but we should be able to specify all kinds of interesting edge cases and failure modes
        * Actually we should be able to do that with the local-only one too, why not?
