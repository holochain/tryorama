# Net Orchestrator (code name Workbook)

The net orchestrator may have much more complex config, specifying a real network topology. Also, the scenario API (`s`) may have more functions that allow you to change the network topology in realtime.

Stream of consciousness sample code to stimulate the brain:

```js

const workbook = new Workbook({
    bridges,
    conductors: {
        a: {
            alice: dnaBlog,
            bob: dnaBlog,
            carol: dnaBlog,
        },
        b: {
            dmitri: dnaBlog,
            edgard: dnaBlog,
            frances: dnaBlog,
        }
    },
    network: {
        adjacency: {
            a: ['b'],
            b: ['a'],
        },
        latency: {
            'a -> b = 500'
        }
    }
})

workbook.scenario("test something", async (s, {alice, bob}) => {
    alice.call("blog", "create_post", {content: "hi"})
    await s.changeTopology({like: 'so'}, () => {
        alice.call('nobody', 'can', 'seeme')
    })
    await s.consistency()
    const result = bob.call("blog", "get_posts")
    assert(result.Ok)
})

```
