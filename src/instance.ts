type CallAdminFunc = (method: string, params: Record<string, any>) => Promise<any>
type CallZomeFunc = (zome: string, fn: string, params: any) => Promise<any>

type InstanceConstructorParams = {
  id: string,
  dnaAddress: string,
  agentAddress: string,
  callAdmin: CallAdminFunc,
  callZome: CallZomeFunc,
}

/**
 * Handy reference to an instance within a Conductor.
 * Rather than using conductor.call('instanceId', 'zomeName', 'funcName', params), you can:
 * `conductor.instances[instanceId].call('zomeName', 'funcName', params)`
 */
export class Instance {

  id: string
  _callAdmin: CallAdminFunc
  _callZome: CallZomeFunc
  agentAddress: string
  dnaAddress: string

  constructor(o: InstanceConstructorParams) {
    this.id = o.id
    this._callAdmin = o.callAdmin
    this._callZome = o.callZome
    this.agentAddress = o.agentAddress
    this.dnaAddress = o.dnaAddress
  }

  call = (...args): Promise<any> => {
    const [zome, fn, params] = args
    if (args.length !== 3 || typeof zome !== 'string' || typeof fn !== 'string') {
      throw new Error("instance.call() must take 3 arguments: (zomeName, funcName, params)")
    }
    return this._callZome(zome, fn, params)
  }

  stateDump = (): Promise<any> => {
    return this._callAdmin('debug/state_dump', { instance_id: this.id })
  }

  getMeta = (...args): Promise<any> => {
    const [hash] = args
    if (args.length !== 1 || typeof hash !== 'string') {
      throw new Error("instance.getMeta() takes 1 argument: (hash)")
    }
    return this._callAdmin('admin/instance/get_meta', {id: this.id, hash: hash})
  }
}
