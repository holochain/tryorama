
type InstanceConstructorParams = { id: string, callZome: any, dnaAddress: string, agentAddress: string }

/**
 * Handy reference to an instance within a Conductor.
 * Rather than using conductor.call('instanceId', 'zomeName', 'funcName', params), you can:
 * `conductor.instances[instanceId].call('zomeName', 'funcName', params)`
 */
export class Instance {

  id: string
  callZome: any
  agentAddress: string
  dnaAddress: string

  constructor(o: InstanceConstructorParams) {
    this.id = o.id
    this.callZome = o.callZome
    this.agentAddress = o.agentAddress
    this.dnaAddress = o.dnaAddress
  }

  call = (...args): Promise<any> => {
    const [zome, fn, params] = args
    if (args.length !== 3 || typeof zome !== 'string' || typeof fn !== 'string') {
      throw new Error("instance.call() must take 3 arguments: (zomeName, funcName, params)")
    }
    return this.callZome(zome, fn, params)
  }
}
