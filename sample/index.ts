const path = require('path')
const { Config, Conductor, Scenario } = require('../src')
Scenario.setTape(require('tape'))

const dnaPath = path.join(__dirname, "../../holochain-rust/app_spec/dist/app_spec.dna.json")
const dna = Config.dna(dnaPath, 'app-spec')
const agentAlice = Config.agent("alice")
const agentBob = Config.agent("bob")
const agentCarol = Config.agent("carol")

const instanceAlice = Config.instance(agentAlice, dna)
const instanceBob = Config.instance(agentBob, dna)
const instanceCarol = Config.instance(agentCarol, dna)

const scenario1 = new Scenario([instanceAlice], { debugLog:true })
const scenario2 = new Scenario([instanceAlice, instanceBob], { debugLog: true })
const scenario3 = new Scenario([instanceAlice, instanceBob, instanceCarol], { debugLog: true })

const testBridge = Config.bridge('test-bridge', instanceAlice, instanceBob)
const scenarioBridge = new Scenario([instanceAlice, instanceBob], { bridges: [testBridge], debugLog: true })


scenario1.runTape('post max content size 280 characters', async (t, { alice }) => {

  const content = "Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum."
  const in_reply_to = null
  const params = { content, in_reply_to }
  const result = await alice.call("blog", "create_post", params)
  console.log('result', result)
  // result should be an error
  t.ok(result.Err);
  t.notOk(result.Ok)

  const inner = JSON.parse(result.Err.Internal)

  t.ok(inner.file)
  t.deepEqual(inner.kind, { "ValidationFailed": "Content too long" })
  t.ok(inner.line)
})
