# TODO


These are Config options from the redux compatible version of tryorama.  A number of them are
still available in the code-base, but they just aren't that useful anymore.


## Simple config with the `Config` helper

> 1. Common configs should be easy to generate

Let's look a common configuration. Here is an example of how you might set up three Players, all of which share the same conductor config which defines a single DNA instance named "chat" using a DNA file at a specified path -- a reasonable setup for writing scenario tests for a single DNA. It's made really easy with a helper called `Config.gen`.

```javascript
import {Config, Orchestrator} from '@holochain/tryorama'

const orchestrator = new Orchestrator()

// Get path for your DNAs using Config.dna helper
// The DNA file can either be on your filesystem...
const dnaBlog = Config.dna('~/project/dnas/blog.dna.gz')
// ... or on the web
const dnaChat = Config.dna('https://url.to/your/chat.dna.gz')
// or manually:
const testDna = path.join(__dirname, 'test.dna.gz')


// Config.gen is a handy shortcut for creating a full-fledged conductor config
// from as little information as possible
//FIXME!
const commonConfig = Config.gen({
  // `Config.dna` generates a valid DNA config object, i.e. with fields
  // "id", "file", "hash", and so on
  chat: Config.dna('path/to/chat.dna.json')
})

orchestrator.registerScenario(async (s, t) => {
  const [alice, bob, carol] = await s.players([
    commonConfig,
    commonConfig,
    commonConfig,
  ]
  )
})
```

`Config.gen` offers a lot of flexibility, which we'll explore more in the next sections.

## Advanced setup with *configuration seeds*

> 2. *Any* conductor config should be possible

If you need your conductor to be configured in a really specific way, fear not, Tryorama can handle that. However, you'd better have a good understanding of how Holochain conductor configuration works, as well as what requirements Tryorama has in order to run tests. In the previous example we used `Config.gen` to create configuration with as little hassle as possible. Let's see what's going on under the hood and how we can write a fully customized conductor config. But, let's also remember the third point:

> 3. Conductors from different scenarios must remain independent and invisible to each other

To achieve the independence of conductors, Tryorama ensure that various values are unique. It uses UUIDs during DNA config as well as for Agent IDs to ensure unique values; it ensures that it automatically creates temp directories for file storage when necessary, adding the paths to the config. So how can we let Tryorama handle these concerns while still generating a custom config? The answer is in a key concept:

**Players are configured by giving them *functions* that generate their config**. For instance, when you call `Config.gen`, it's actually creating a function for you like this:

```typescript
// this
const config = Config.gen({alice: dnaConfig})

// becomes this
const config = ({playerName, uuid, configDir, adminInterfacePort}) => {
  return {
    environment_path: configDir,
    network: {/* ... */},
    dpki: {/* ... */},
    // and so on...
    // basically, a complete Conductor configuration
  }
})
```

Such a function is called a *config seed*, since the function is reusable across all scenarios.

Config seeds take an object as a parameter, with five values:

* `scenarioName`: the name of the current scenario, i.e. `registerScenario(scenarioName, ...)`
* `playerName`: the name of the player for this conductor, e.g. `"alice"`
* `uuid`: a UUID which is guaranteed to be the same within a scenario but unique between different scenarios
* `configDir`: a temp dir created specifically for this conductor
* `adminInterfacePort`: a free port on the machine which is used for the admin Websocket interface

### What Tryorama expects from generated configs

Under the hood, Tryorama generates unique and valid values for these parameters and generates unique configurations by injecting these values into the seed functions. If you are writing your own config seed, you can use or ignore these values as needed, but you must be careful to set things up in a way that Tryorama can work with to drive the test scenarios:

* There must be an admin interface running over WebSockets at `adminInterfacePort` which includes all instances that are part of this test
* *All* agents within a scenario must have a unique name (even across different conductors!)
* You must incorporate the UUID or some other source of uniqueness into the DNA config's `uuid` field, to ensure that conductors in different tests do not attempt to connect to each other on the same network

### Using seed functions in `Config.gen`

Since configuring a full config that properly uses these injected values is really tedious and error-prone, especially for the part concerning agents and instances, `Config.gen` also accepts functions using the usual seed arguments. So if you need to set up your dpki config using some of these values, you could do so:

```js
Config.gen(
  {alice: dnaConfig},
  ({playerName, uuid}) => {
    return {
      dpki: {
        instance_id: 'my-instance',
        init_params: JSON.stringify({
          someValueThatNeedsToBeUnique: uuid,
          someValueThatWantsToBeThePlayerName: playerName,
        })
      }
    }
  }
)
```

You can also use a seed function in the first parameter of `Config.gen`, as long as the function returns a valid value, e.g.:

```js
Config.gen(
  ({playerName}) => ({
    [`${playerName}-1`]: dnaConfig,
    [`${playerName}-2`]: dnaConfig,
  })
)
```

# Middlewares and Modes

Tryorama includes a very flexible Middleware system. A tryorama middleware is a complicated little function which modifies the Scenario API (`s`) for each scenario. Middlewares can be composed together, to add layers of functionality.

For most common use cases, middleware is not necessary. If no middleware is specified, a tryorama Orchestrator is configured to use the combination of two middlewares:

- `tapeExecutor`, which integrates scenarios with the `tape` test harness and injects an extra `t` argument into scenario functions
- `localOnly`, which specifies that players are to be run on the local machine. This can be swapped out with other middleware to cause players to run on remote machines! (See the section on TryCP for more on this.)

i.e., the following two are equivalent:

```js
const {Orchestrator, tapeExecutor, localOnly, combine} = require('@holochain/tryorama')

// this (the default):
new Orchestrator()

// is equivalent to this:
new Orchestrator({
  middleware: combine(
    tapeExecutor(require('tape')),
    localOnly
  )
})
```

If you want to use custom middleware to add new layers of functionality, you will have to explicitly include these two middlewares in your `combine` chain to retain the default functionality.

Writing middleware is a bit complicated, but you can see a range of middleware specimens and combinators in [src/middlewares.ts](src/middlewares.ts), all of which are available for import.

# Remote Players with TryCP

Tryorama natively supports running conductors on remote machines. As mentioned in the section on Middlewares, by default the Orchestrator includes `localOnly` middleware, which specifies that all players should run on a local machine. It does this by actually modifying the config passed into `s.players`. All player config examples shown in this README up until now are actually not valid unless the `localOnly` or other middleware is present to transform it into the proper shape.

What `localOnly` actually does is to transform this:

```js
const config = Config.gen({instance: dna})
s.players({
  alice: config,
  bob: config,
})
```

into this:

```js
s.players({
  local: {
    alice: config,
    bob: config,
  }
})
```

Without any middlewares, `s.players` actually expects the config passed to it to specify the machine that this player should run upon. The above code is showing that two conductors should be spawned on the `"local"` machine, which is a special-case string meaning that a conductor process will be spawned on this machine.

To specify a remote machine, instead of `"local"`, you use a WebSocket URL pointing to a machine running a [TryCP server](https://github.com/holochain/holochain-rust/tree/develop/crates/trycp_server). (TryCP, the Tryorama Control Protocol, is a simple protocol which allows a client, like an Orchestrator, to ask a server, like a remote machine, to spin up and configure conductors on its behalf.) So, if you have two machines running TryCP servers, and you're *not* using any middleware, you can do the following to run each player on a separate machine:

```js
s.players({
  "ws://location.of.machine.org:1234": {
    alice: config,
  },
  "ws://location.of.other.machine.org:9876": {
    bob: config,
  }
})
```

There is also a middleware which can be swapped out for `localConfig` called `machinePerPlayer`, which will perform this automatically, given player config that is not wrapped up with machine info. This allows you to write player config without regard for the machine name, and then by swapping the middleware, you can quickly switch between local and remote testing without altering your scenario code.

In the above example, alice and bob will be on two different machines. The Holochain core team is using this functionality to stress-test networking capabilities with hundreds of remote machines orchestrated by Tryorama.
