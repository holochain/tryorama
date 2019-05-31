import * as colors from 'colors'

export class DnaInstance {

  id: string
  agentAddress: string | null
  dnaAddress: string | null
  callZome: any

  constructor (instanceId, callZome) {
    this.id = instanceId
    this.agentAddress = null
    this.dnaAddress = null
    this.callZome = callZome
  }

  // internally calls `this.conductor.call`
  async call (zome, fn, params) {
    try {
      const result = await this.callZome(this.id, zome, fn)(params)
      console.info(colors.blue.inverse("zome call"), this.id, zome, fn, params)
      return JSON.parse(result)
    } catch (e) {
      console.error('Exception occurred while calling zome function: ', e)
      throw e
    }
  }
}
