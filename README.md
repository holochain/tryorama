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
import { Orchestrator, Config } from '../../src'

// Point to your DNA file and give it a nickname.
// The DNA file can either be on your filesystem...
const dnaBlog = Config.dna('~/project/dnas/blog.dna.json', 'blog')
// ... or on the web
const dnaChat = Config.dna('https://url.to/your/chat.dna.json', 'chat')

// Set up a Conductor configuration using the handy `Conductor.config` helper.
// Read the docs for more on configuration.
const mainConfig = Config.gen(
  {
    blog: dnaBlog,  // agent_id="blog", instance_id="blog", dna=dnaBlog
    chat: dnaChat,  // agent_id="chat", instance_id="chat", dna=dnaChat
  },
  {
    // specify a bridge from chat to blog
    bridges: [Config.bridge('bridge-name', 'chat', 'blog')],
    // use a sim2h network (see conductor config options for all valid network types)
    network: {
      type: 'sim2h',
      sim2h_url: 'ws://localhost:9000',
    },
    // etc., any other valid conductor config items can go here
  }
})

// Instatiate a test orchestrator.
// It comes loaded with a lot default behavior which can be overridden, including:
// * custom conductor spawning
// * custom test result reporting
// * scenario middleware, including integration with other test harnesses
const orchestrator = new Orchestrator()

// Register a scenario, which is a function that gets a special API injected in
orchestrator.registerScenario('proper zome call', async (s, t) => {
  // Declare two players using the previously specified config,
  // and nickname them "alice" and "bob"
  const {alice, bob} = await s.players({alice: mainConfig, bob: mainConfig})

  // You have to spawn the conductors yourself...
  await alice.spawn()
  // ...unless you pass `true` as an extra parameter,
  // in which case each conductor will auto-spawn
  const {carol} = await s.players({carol: mainConfig}, true)

  // You can also kill them...
  await alice.kill()
  // ...and re-spawn the same conductor you just killed
  await alice.spawn()

  // now you can make zome calls,
  await alice.call('chat', 'messages', 'direct_message', {
    content: 'hello world',
    target: carol.instance('chat').agentAddress
  })

  // you can wait for total consistency of network activity,
  await s.consistency()

  // and you can make assertions using tape by default
  const messages = await carol.call('chat', 'messages', 'list_messages', {})
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
  const {alice, bob} = await s.players({alice: config, bob: config})

  // start alice's conductor
  await alice.spawn()

  // make a zome call
  const result = await alice.call('some-instance', 'some-zome', 'some-function', 'some-parameters')

  // another use of the Scenario API is to automagically wait for the network to
  // reach a consistent state before continuing the test
  await s.consistency()

  // make a test assertion with tape
  t.equal(result.Ok, 'the expected value')
})
```

Each scenario will automatically kill all running conductors as well as automatically end the underlying tape test (no need to run `t.end()`).

## Players

A Player represents a Holochain user running a Conductor. That conductor may run on the same machine as the Tryorama test orchestrator, or it may be a remote machine (See [Remote Players with TryCP](#remote-players-with-trycp)). Either way, the main concern in configuring a Player is providing configuration for its underlying Conductor.

# Conductor configuration

Much of the purpose of Tryorama is to provide ways to generate conductor configurations (TODO: we need documentation on conductor configs) that meet the following criteria:

1. Common configs should be easy to generate
2. Any conductor config should be possible
3. Conductors from different scenarios must remain independent and invisible to each other

## Simple config with the `Config` helper

> 1. Common configs should be easy to generate

Let's look a common configuration. Here is an example of how you might set up three Players, all of which share the same conductor config which defines a single DNA instance named "chat" using a DNA file at a specified path -- a reasonable setup for writing scenario tests for a single DNA. It's made really easy with a helper called `Config.gen`.

```javascript
import {Config, Orchestrator} from '@holochain/tryorama'

const orchestrator = new Orchestrator()

// Config.gen is a handy shortcut for creating a full-fledged conductor config
// from as little information as possible
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
  })
})
```

`Config.gen` also takes an optional second parameter. The first parameter allows you to specify the parts of the config which are concerned with DNA instances, namely "agents", "dnas", "instances", and "interfaces". The second parameter allows you to specific how the rest of the config is generated. `Config` also has other helpers for generating other parts. For instance, to turn off logging, there is an easy way to do it like so:

```typescript
const commonConfig = Config.gen(
  {
    chat: Config.dna('path/to/chat.dna.json')
  },
  {
    logger: Config.logger(false)
  }
)
```

`Config.gen` offers a lot of flexibility, which we'll explore more in the next sections.


## More fine-grained instance setup with `Config.gen`

> 2. Any conductor config should be possible

`Config.gen` can be used in a slightly more explicit way. The first argument can take an object, as shown, which is a handy shorthand for quickly specifying instances with DNA files. If you need more control, you can define instances in a more fine-grained way using an array:

```typescript
const dnaConfig = Config.dna('path/to/chat.dna.json', 'chat')

// this
Config.gen({
  myInstance: dnaConfig
  myOtherInstance: dnaConfig
})

// is equivalent to this
Config.gen([
  {
    id: 'myInstance',
    agent: {
      id: 'myInstance',
      name: name1, // NB: actually generated by Tryorama, it's necessary for agent names to be distinct across all conductors...
      public_address: 'HcS----------...',
      keystore_file: 'path/to/keystore',
    },
    dna: {
      id: 'chat',
      file: 'path/to/chat.dna.json',
    }
  },
  {
    id: 'myOtherInstance',
    agent: {
      id: 'myOtherInstance,
      name: name2, // NB: actually generated by Tryorama, it's necessary for agent names to be distinct across all conductors...
      public_address: 'HcS----------...',
      keystore_file: 'path/to/keystore',
    },
    dna: {
      id: 'chat',
      file: 'path/to/chat.dna.json',
    }
  }
])
```

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
    persistence_dir: configDir,
    agents: [/* ... */],
    dnas: [/* ... */],
    instances: [/* ... */],
    interfaces: [/* ... */],
    network: {/* ... */},
    // and so on...
    // basically, a complete Conductor configuration in JSON form
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
* `appInterfacePort`: a free port on the machine which is used to make zome calls

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

Copyright (C) 2019, Holochain Foundation

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

[http://www.apache.org/licenses/LICENSE-2.0](http://www.apache.org/licenses/LICENSE-2.0)

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
