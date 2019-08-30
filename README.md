# try-o-rama

A scenario testing framework for Holochain applications

## Sample usage

Check out this heavily commented example for an idea of how to use Try-o-rama

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
  // Declare two conductors using the previously specified config, 
  // and nickname them "alice" and "bob"
  const {alice, bob} = await s.conductors({alice: mainConfig, bob: mainConfig})
  
  // You have to spawn the conductors yourself...
  await alice.spawn()
  // ...unless you pass `true` as an extra parameter, 
  // in which case each conductor will auto-spawn
  const {carol} = await s.conductors({carol: mainConfig}, true)

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
