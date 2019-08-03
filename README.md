# try-o-rama

> diorama++ === triorama, but "try-o-rama" is catchier ;)

**NOTE:** This is experimental software, intended for use by Holochain Core developers to test real-world networking scenarios. If you are developing your own DNA and want to write scenario tests, your best bet is to use [diorama](https://github.com/holochain/diorama), which is more stable.

- - -

Try-o-rama orchestrates scenario tests across multiple Conductors. The test writer writes scenarios and registers them with Try-o-rama. Once a collection of Conductors have been started by some other process, they can register with a Orchestrator which will cause the steps of the scenario to be executed on each Conductor, results reported back, and assertions made.

## Basic usage

```js
const {Orchestrator} = require('@holochain/try-o-rama')

// We'll set up three conductors, all of which share the exact same configuration:

const conductorConfig = {
  instances: {
    blog: Orchestrator.dna('path/to/blog.dna.json', 'blog'),
    comments: Orchestrator.dna('path/to/comments.dna.json', 'comments'),
  },
  bridges: [
    Orchestrator.bridge('bridge-handle', 'blog', 'comments'),
  ],
}

const orchestrator = new Orchestrator({
  conductors: {
    alice: conductorConfig,
    bob: conductorConfig,
    carol: conductorConfig,
  }
})

orchestrator.registerScenario('a test', async (s, {alice, bob}) => {
    await alice.blog.call('blog', 'create_post', {
        content: 'holo wurld'
    })
    await s.consistent()
    const posts = await bob.blog.call('blog', 'list_posts')
    // write some assertions
})

orchestrator.run()

```

## Stay tuned

Much more documention to come!
