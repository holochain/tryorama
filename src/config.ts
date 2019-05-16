
export type AgentConfig = {
  id: string,
  name: string,
}

export type DnaConfig = {
  id: string,
  path: string,
}

export type InstanceConfig = {
  id: string
  agent: AgentConfig
  dna: DnaConfig
}

// nested or not?
// type BridgeConfig = {
//   handle: string
//   caller_id: string
//   callee_id: string
// }

export const Config = {
  agent: id => ({ name: id, id }),
  dna: (path, id = `${path}`) => ({ path, id }),
  bridge: (handle, caller, callee) => ({
    handle,
    caller_id: caller.name,
    callee_id: callee.name
  }),
  instance: (agent, dna, id = agent.id) => ({
    id,
    agent,
    dna
  })
}
