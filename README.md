# try-o-rama

An end-to-end/scenario testing framework for Holochain applications in JavaScript/TypeScript

## Installation

    npm install @holochain/try-o-rama

## Scenarios

Tryorama lets you write scenarios involving multiple DNA instances on multiple conductors. The scenarios read like a script in a play. In very loose pseudocode, a scenario looks something like this:

```
create players alice and bob
alice.call("chat", "channels", "post_message_to_channel", "hello!")
wait for consistency
result = bob.call("chat", "channels", "get_messages_on_channel", {})
assert result[0] === "hello!"
```

Scenarios let you specify a fixed interaction between multiple Holochain nodes ("players") and make assertions about the resulting state changes. The previous pseudocode example scenario actually looks like this in Javascript:

```javascript
const myPlayerConfig = {
  instances: {
    chat: Config.dna('chat', 'path/to/chat.dna.json')
  }
}

orchestator.registerScenario('messages are fetchable', async s => {
  const { alice, bob } = await s.players({ alice: myPlayerConfig, bob: myPlayerConfig }, true)
  await alice.call('chat', 'channels', 'post_message_to_channel', 'hello!')
  await s.consistency() // wait long enough for network propagation to reach bob
  const result = await bob.call('chat', 'channels', 'get_messages_on_channel', {})
  assert(result.Ok[0] === 'hello!')
})

orchestrator.run()
```

## Orchestrators

Set up an Orchestrator and register your Scenarios with it. The Orchestrator specifies things like:

- how to spawn new conductor processes
- how to generate the configuration for each conductor
- how each scenario actually gets executed, including possible integration with third-party test harnesses

Try-o-rama comes with sensible defaults so you can get up and running with an Orchestrator with little or no configuration. It also includes some helpful Middleware to modify the behavior, such as adding functions to the Scenario API or integrating with a test harness.

## Player Configuration

Each scenario specifies how many "players", or nodes, are participating, and how to configure them. A very simple example of configuration can be seen in the leading example, in the variable `myPlayerConfig`. There are two basic ways to specify player configuration: as an object or as a function. The object-based approach has two flavors, "sugared" and "plain"

### As an object

#### Sugared

The "sugared" config flavor is the most concise way to specify a full conductor config for the purpose of scenario tests, which is suitable for a typical app developer's scenario tests. It looks like this:

```javascript
const mySugaredConfig = {
  // this is the sugared part
  instances: {
    [instanceId1]: dnaConfig1,
    [instanceId2]: dnaConfig2,
  },

  // optional
  bridges: [
    Config.bridge('bridge-name', instanceId1, instanceId2)
  ],

  // optional
  dpki: {
    instance_id: instanceId1,
    init_params: {}
  },
}
```

The only required field is `instances`. In the above example, `instances` is an object, where the keys are instance IDs and the values are DNA configs. Incidentally, the keys of this object are also used as Agent IDs to create TestAgents for each instance.

#### Plain

In many cases, sugared config is all you need. If you need more control over instance configuration, you can drop down to the more verbose "plain" flavor, where `instances` is an Array instead of an Object. The rest of the configuration remains the same.

```javascript
const myPlainConfig = {
  // now it's an Array instead of an Object
  instances: [
    {
      id: instanceId1,
      agent: {
        id: agentId1,
        name: 'name1', // NB: it's necessary for agent names to be distinct across all conductors
        public_address: 'HcS----------...',
        keystore_file: 'path/to/keystore',
      },
      dna: {
        id: dnaId1,
        file: dnaPath1,
      }
    },
    {
      id: instanceId2,
      agent: {
        id: agentId2,
        name: 'name2', // NB: it's necessary for agent names to be distinct across all conductors
        public_address: 'HcS----------...',
        keystore_file: 'path/to/keystore',
      },
      dna: {
        id: dnaId2,
        file: dnaPath2,
      }
    }
  ],

  // still optional
  bridges: [
    Config.bridge('bridge-name', instanceId1, instanceId2)
  ],

  // still optional
  dpki: {
    instance_id: instanceId1,
    init_params: {}
  },
}
```

### As a function

If you need even absolute control over the generated conductor config because you're doing something tricky, you can pass in a function that takes a few parameters and returns a fully-formed string of TOML. You must write the config correctly and meet the following requirements:

* There must be an admin interface running over WebSockets at `adminPort`
* There must be an interface running over WebSockets at `zomePort` including all instances
* All agents must have a unique name
* You must incorporate the UUID or some other source of uniqueness into the DNA config's `uuid` field, to ensure that conductors in different tests do not attempt to connect to each other on the same network

Basically, you really have to know what you're doing to make this work! It looks like this:

```javascript
const myConfigFunction = ({
  conductorName,
  configDir,
  uuid,
  adminPort,
  zomePort,
}) => `
persistence_dir = ${configDir}

[agents]
# etc...

[dnas]
# etc...

[instances]
# etc...

[[interfaces]]
# etc...
`
```


## Sample usage

Check out this heavily commented example for a more complete idea of how to use Try-o-rama

```javascript
import { Orchestrator, Config } from '../../src'

// Point to your DNA file and give it a nickname. 
// The DNA file can either be on your filesystem...
const dnaBlog = Config.dna('~/project/dnas/blog.dna.json', 'blog')
// ... or on the web
const dnaChat = Config.dna('https://url.to/your/chat.dna.json', 'chat')

// Set up a Conductor configuration using the handy `Conductor.config` helper. 
// Read the docs for more on configuration.
const mainConfig = Config.genConfig({
  instances: {
    blog: dnaBlog,  // agent_id="blog", instance_id="blog", dna=dnaBlog
    chat: dnaChat,  // agent_id="chat", instance_id="chat", dna=dnaChat
  },
  // specify a bridge from chat to blog
  bridges: [Config.bridge('bridge-name', 'chat', 'blog')],
})

// Instatiate a test orchestrator. 
// It comes loaded with a lot default behavior which can be overridden, including:
// * custom conductor spawning
// * custom test result reporting
// * scenario middleware, including integration with other test harnesses
const orchestrator = new Orchestrator()

// Register a scenario, which is a function that gets a special API injected in
orchestrator.registerScenario('proper zome call', async s => {
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
    target: carol.agentAddress('chat')
  })

  // you can wait for total consistency of network activity,
  await s.consistency()

  // and you can make assertions using your assertion library of choice
  const messages = await carol.call('chat', 'messages', 'list_messages', {})
  assert(messages.length === 1)
})

// Run all registered scenarios as a final step, and gather the report
const report = await orchestrator.run()

// Note: when using middleware, you can hook up a test harness to do reporting for you
console.log(report)
```
