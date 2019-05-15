# More verbose config for D1

In the original Scenario API, we had a more explicit config, which I'll include here just for comparison with the new proposed way.

```js
// Define the DNA
const dnaPersonas = Config.dna('personas', '/path/to/personas.dna.json')
const dnaBlog = Config.dna('blog', '/path/to/blog.dna.json')
// { id: 'blog', path: '/path/to/blog.dna.json' }

// Define the agents
const agentAlice = Config.agent('alice')
const agentBob = Config.agent('bob')
const agentCarol = Config.agent('carol')
// { id: 'carol', name: 'carol' }

const bridges = [
    Config.bridge('the-handle', dnaBlog, dnaPersonas)
]

// Create the single conductor that all tests,
// across all files, will use
const conductor = new Conductor({debugLog: true})

const playbook2 = new Playbook(conductor, {
    instances: [
        Config.instance(agentAlice, dnaBlog),
        Config.instance(agentBob, dnaBlog),
    ],
    bridges
})
const playbook3 = new Playbook(conductor, {
    // more explicit list version
    instances: [
        Config.instance(agentAlice, dnaBlog),
        Config.instance(agentBob, dnaBlog),
        Config.instance(agentCarol, dnaBlog),
    ],
    // either way, set up bridges:
    bridges
})
```
