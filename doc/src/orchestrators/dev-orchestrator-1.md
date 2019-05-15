# Playbook (D1)

## Constraints

We're using a real conductor, which has some overhead with startup and creation of agents, DNAs, etc. Therefore, we want to keep this overhead as low as possible by only using one conductor instance for the entire test suite.

Therefore, we need a `Conductor` object which is passed to each new `Playbook`.

## Config

In the original Scenario API, we had a [more verbose way](./dev-orchestrator-1-verbose.md) to configure the conductor environment.
We can also do this a lot more succinctly. From experience with that way of doing config, I think we can significantly reduce this boilerplate like so:

Rather than specifying an explicit list of instance configs, we can specify a mapping from agent to DNA which fully defines an instance while simultaneously giving it a friendly name, which will be shared with the agent. Check it out:

```js
const dnaPersonas = Config.dna('personas', '/path/to/personas.dna.json')
const dnaBlog = Config.dna('blog', '/path/to/blog.dna.json')

const bridges = [
    Config.bridge('the-handle', dnaBlog, dnaPersonas)
]

const conductor = new Conductor({debugLog: true})

const playbook = new Playbook(conductor, {
    bridges: bridges,
    instances: {
        alice: dnaBlog,
        bob: dnaBlog,
        carol: dnaBlog,
    },
})
```
Note the instance config object passed to `Playbook`:

* the key (e.g. "alice") becomes the instance ID as well as the agent ID and agent name (3 in 1!)
* the value is the DNA config
* this is not only incredibly compact and readable, but it prevents duplicates of instance IDs
* it obviates the need to explicitly configure agents and instances

As an orchestrator, playbook can run scenarios:

```js

require('./a-bunch-of-scenarios')(playbook.scenario)

```
