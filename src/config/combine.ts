const TOML = require('@iarna/toml')
const _ = require('lodash')

import { genConfig, ZOME_INTERFACE_ID } from "./gen";
import * as T from "../types";
import { trace } from "../util";


export const combineConfigs = 
(configs: Array<T.AnyConductorConfig>, debugLog: boolean = false) => 
(args: T.GenConfigArgs) => {
  const configsJson = configs
    .map(c => genConfig(c, debugLog)(args))
    .map(TOML.parse)
}

export const incBy = n => x => x += n 

export const mergeJsonConfigs = (configs: Array<any>) => {
  const agents = _.chain(configs)
    .map(c => c.agents)
    .flatten()
    .map((c, i) => _.update(c, 'id', incBy(i)))
    .value()
  const dnas = _.chain(configs)
    .map(c => c.dnas)
    .uniqBy(dna => dna.id)
    .flatten()
    .value()
  const instances = _.chain(configs)
    .map(c => c.instances)
    .mapValues((inst, i) => 
      _.chain(inst)
      .update('id', incBy(i))
      .update('agent', incBy(i))
      .value()
    )
    .flatten()
    .value()
  const bridges = _.chain(configs)
    .map(c => c.bridges)
    .map((bs, i) => 
      _.chain(bs)
      .flatten()
      .map(b => _.chain(b)
        .update('caller_id', incBy(i))
        .update('callee_id', incBy(i))
        .value()
      )
      .value()
    )
    .flatten()
    .value()
  
  console.log('---------------')
  console.log(agents)
  console.log(dnas)
  console.log(instances)
  console.log('---------------')

  const first = configs[0]
  const zomeInterfaceIndex = _.findIndex(first.interfaces, i => i.id === ZOME_INTERFACE_ID)
  const zomeInterfaceInstances = _.chain(configs)
    .map(c => c.interfaces[zomeInterfaceIndex])
    .map(i => i.instances)
    .value()

  const interfaces = _.set(
    first.interfaces, 
    [zomeInterfaceIndex, 'instances'], 
    zomeInterfaceInstances
  )

  return Object.assign({}, first, {
    agents,
    dnas,
    bridges,
    instances,
    interfaces,
  })
}