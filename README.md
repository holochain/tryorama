# tryorama

- - -

> # ⚠️ NOTE: Tryorama is in a transitional phase ⚠️
>
> Tryorama is being rewritten. Most functionality
> is missing, tests are no longer expected to work, and this README cannot be guaranteed to be accurate. As progress is made, this codebase will be unified into a cohesive whole, and Tryorama
> will eventually become a user-friendly testing framework once again.
>
> For now, see [test/rsm](test/rsm) for some tests that DO work.

- - -


An end-to-end/scenario testing framework for Holochain applications, written in TypeScript.

[![Project](https://img.shields.io/badge/project-holochain-blue.svg?style=flat-square)](http://holochain.org/)
[![Chat](https://img.shields.io/badge/chat-chat%2eholochain%2enet-blue.svg?style=flat-square)](https://chat.holochain.net)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://www.apache.org/licenses/LICENSE-2.0)


Tryorama allows you to write test suites about the behavior of multiple Holochain nodes which are networked together, while ensuring that test nodes in different tests do not accidentally join a network together.

    npm install @holochain/tryorama

Take a look at the sample below, or skip to the [Conceptual Overview](#conceptual-overview) for a more in depth look.

## Sample usage

Check out this heavily commented example for an idea of how to use tryorama

```javascript
import { Orchestrator, Config, InstallAgentsHapps } from '@holochain/tryorama'


// Get path for your DNAs using Config.dna helper
// The DNA file can either be on your filesystem...
const dnaBlog = Config.dna('~/project/dnas/blog.dna.gz')
// ... or on the web
const dnaChat = Config.dna('https://url.to/your/chat.dna.gz')
// or manually:
const testDna = path.join(__dirname, 'test.dna.gz')


// create an InstallAgentsHapps array with your DNA to tell tryorama what
// to install into the conductor.
const installation: InstallAgentsHapps = [
  // agent 0
  [
    // blog happ
    [dnaBlog],
    // chat happ
    [dnaChat]
  ],
  // agent 1
  [
    // test happ
    [testDna]
  ]
}

// Set up a Conductor configuration using the handy `Conductor.config` helper.
// Read the docs for more on configuration.
const conductorConfig = Config.gen()

// Instatiate your test's orchestrator.
// It comes loaded with a lot default behavior which can be overridden, including:
// * custom conductor startup
// * custom test result reporting
// * scenario middleware, including integration with other test harnesses
const orchestrator = new Orchestrator()

// Register a scenario, which is a function that gets a special API injected in
orchestrator.registerScenario('proper zome call', async (s, t) => {
  // Declare two players using the previously specified config, nicknaming them "alice" and "bob"
  // note that the first argument to players is just an array conductor configs that that will
  // be used to spin up the conductor processes which are returned in a matching array.
  const [alice, bob] = await s.players([conductorConfig, conductorConfig])

  // install your happs into the coductors and destructuring the returned happ data using the same
  // array structure as you created in your installation array.
  const [[alice_blog_happ, alice_chat_happ], [alice_test_happ]] = await alice.installAgentsHapps(installation)
  const [[bob_blog_happ, bob_chat_happ], [bob_test_happ]] = await bob.installAgentsHapps(installation)

  // then you can start making zome calls either on the cells in the order in which the dnas
  // where defined, with params: zomeName, fnName, and arguments:
  const res = await alice_blog_happ.cells[0].call('messages, 'list_messages', {})

  // or you can destructure the cells for more semantic references (this is most usefull
  // for multi-dna happs):
  const [bobs_blog] = bob_blog_happ.cells
  const res = await bobs_blog.call('blog', 'post', {body:'hello world'})

  // You can create players with unspawned conductors by passing in false as the second param:
  const [carol] = await s.players([conductorConfig], false)

  // and then start the conductor for them explicitly with:
  await carol.startup()

  // and install a single happ
  const [carol_blog_happ] = await carol.installHapp([dnaBlog])
  // or a happ with a previously generated key
  const [carol_test_happ_with_bobs_test_key] = await carol.installHapp([dnaTest], bob_blog_happ.agent)

  // You can also shutdown conductors:
  await alice.shutdown()
  // ...and re-start the same conductor you just stopped
  await alice.startup()

  // you can wait for total consistency of network activity,
  // FIXME!
  await s.consistency()

  // and you can make assertions using tape by default
  const messages = await bobs_blog.call('messages', 'list_messages', {})
  t.equal(messages.length, 1)
})

// Run all registered scenarios as a final step, and gather the report,
// if you set up a reporter
const report = await orchestrator.run()

// Note: by default, there will be no report
console.log(report)
```


# Conceptual overview

To understand Tryorama is to understand its components. Tryorama is a test *Orchestrator* for writing tests about the behavior of multiple Holochain nodes which are networked together. It allows the test writer to write *Scenarios*, which specify a fixed set of actions taken by one or more *Players*, which represent Holochain nodes that may come online or offline at any point in the scenario. Actions taken by Players include making zome calls and turning on or off their Holochain Conductor.

## Orchestrators

Test suites are defined with an `Orchestrator` object. For most cases, you can get very far with an out-of-the-box orchestrator with no additional configuration, like so:

```typescript
import {Orchestrator} from '@holochain/tryorama'
const orchestator = new Orchestrator()
```

The Orchestrator constructor also takes a few parameters which allow you change modes, and in particular allows you to specify Middleware, which can add new features, drastically alter the behavior of your tests, and even integrate with other testing harnesses. We'll get into those different options later.

The default Orchestrator, as shown above, is set to use the local machine for test nodes, and integrates with the [`tape` test harness](https://github.com/substack/tape). The following examples will assume you've created a default orchestrator in this way.

## Scenarios

A Tryorama test is called a *scenario*. Each scenario makes use of a simple API for creating Players, and by default includes an object for making [tape assertions](https://github.com/substack/tape#methods), like `t.equal()`. Here's a very simple scenario which demonstrates the use of both objects.

```typescript
// `s` is an instance of the Scenario API
// `t` is the tape assertion API
orchestrator.registerScenario('description of this scenario', async (s, t) => {
  // Use the Scenario API to create two players, alice and bob (we'll cover this more later)
  const [alice, bob] = await s.players([config, config])

  // install happs in the conductors
  const [[the_happ]] = await alice.installAgentsHapps(installation)

  // make a zome call
  const result = await the_happ.cells[0].call('some-zome', 'some-function', 'some-parameters')

  // another use of the Scenario API is to automagically wait for the network to
  // reach a consistent state before continuing the test
  // FIXME
  await s.consistency()

  // make a test assertion with tape
  t.equal(result.Ok, 'the expected value')
})
```

Each scenario will automatically shutdown all running conductors as well as automatically end the underlying tape test (no need to run `t.end()`).

## Players

A Player represents a Holochain user running a Conductor. That conductor may run on the same machine as the Tryorama test orchestrator, or it may be a remote machine (See [Remote Players with TryCP](#remote-players-with-trycp)). Either way, the main concern in configuring a Player is providing configuration and initialization for its underlying Conductor.

# Conductor setup

Much of the purpose of Tryorama is to provide ways to setup conductors for tests, which means generating their boot configuration files, and initializing them to known states (installing hApps) for scenarios.


## Goals
1. Common setups should be easy to generate
2. Any conductor setups should be possible
3. Conductors from different scenarios must remain independent and invisible to each other

Setting up a conductor for a test consists of two main parts:
1. Creating a conductor config and starting it up
2. Installing hApps into the running conductor

## Conductor Configuration
You don't have to think about conductor configuration (networking, bootstrap server, lair directory etc) if you don't want to by simply using the `Config.gen()` helper:

``` js
const config = Config.gen()
orchestrator.registerScenario('my scenario dnas', async (s: ScenarioApi, t) => {
  const [alice] = await s.players([config])
}
```
See below for more complicated ways to generate config files.

## Happ Installation

Tryoroma's provides the `InstallAgentsHapps` abstraction to making it simple to install any combination of hApps and create agents for them with minimal configuration file building naming.  `InstallAgentsHapps` does this as an agents/happ/dna tree just using DNA paths as the leaves of a nested array.

A simple example:

``` js
const installation: InstallAgentsHapps = [
  // agent 0 ...
  [
    // happ 1
    [
      // dna 1
      path.join(__dirname, 'test.dna.gz')
    ]
  ],
]
```

When this installation is passed into the scenario `players` function, what's returned is an identically structured array of installed happs, where tryorama takes care of generating all the agent Ids, happ Ids and cell nicks, so you don't have to manually do that work in a config file, you can simply destructure the results into variables with semantic names relevant to your tests.  E.g, from the initialization above:

``` js
  const [[test_happ]] = await alice.installAgentsHapps(initialization)
```
where `test_happ` is an `InstalledHapp` object that looks like this:

``` js
export type InstalledHapp = {
  // the agent shared by all the Cell instances in `.cells`
  agent: AgentPubKey
  // the instantiated cells, which allow
  // for actual zome calls
  cells: Cell[]
}
```

TODO: Config.dna


## Simple config with the `Config` helper

> 1. Common configs should be easy to generate

Let's look a common configuration. Here is an example of how you might set up three Players, all of which share the same conductor config which defines a single DNA instance named "chat" using a DNA file at a specified path -- a reasonable setup for writing scenario tests for a single DNA. It's made really easy with a helper called `Config.gen`.

```javascript
import {Config, Orchestrator} from '@holochain/tryorama'

const orchestrator = new Orchestrator()

// Config.gen is a handy shortcut for creating a full-fledged conductor config
// from as little information as possible
//FIXME!
const commonConfig = Config.gen({
  // `Config.dna` generates a valid DNA config object, i.e. with fields
  // "id", "file", "hash", and so on
  chat: Config.dna('path/to/chat.dna.json')
})

orchestrator.registerScenario(async (s, t) => {
  const {alice, bob, carol} = await s.players({
    alice: commonConfig,
    bob: commonConfig,
    carol: commonConfig,
  },
  initialization
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

# License
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://www.apache.org/licenses/LICENSE-2.0)

Copyright (C) 2019-2020, Holochain Foundation

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

[http://www.apache.org/licenses/LICENSE-2.0](http://www.apache.org/licenses/LICENSE-2.0)

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
