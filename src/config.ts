
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
