const TOML = require('@iarna/toml')
const _ = require('lodash')

import { genConfig, ZOME_INTERFACE_ID } from "./gen";
import * as T from "../types";
import { trace } from "../util";


export const combineConfigs = 
(configs: T.ObjectS<T.AnyConductorConfig>, debugLog: boolean = false) => 
async (args: T.GenConfigArgs) => {
  const configsJson = await _.chain(configs)
    .toPairs()
    .map(async ([name, c]) => [name, await genConfig(c, debugLog)(args)])
    .thru(x => Promise.all(x))
    .value()
    .then(cs => cs.map(([_, c]) => (TOML.parse(c))))
  const merged = mergeJsonConfigs(configsJson)
  console.log("MERGED", merged)
  return TOML.stringify(merged)
}

export const suffix = suff => x => `${x}-${suff}`

/**
 * Given a map with keys as conductor names and values as conductor configs Objects,
 * merge all configs into a single valid conductor config Object.
 * Basically, each agent ID is suffixed by the conductor name, and referendes updated
 * to preserve uniqueness. Then all agents, dnas, instances, and bridges are merged
 * together.
 * 
 * All other options, like logging, interfaces, etc. are taken from one particular config,
 * with the assumption that the others are the same. The `standard` param allows you to
 * specify, by conductor name, which config to use to pull these other values from.
 */
export const mergeJsonConfigs = (configs: T.ObjectS<any>, standard?: string) => {

  const agents = _.chain(configs)
    .toPairs()
    .map(([name, c]) => 
      _.chain(c.agents)
      .map(a => _.update(a, 'id', suffix(name)))
      .value()
    )
    .flatten()
    .value()

  const dnas = _.chain(configs)
    .map(c => trace(c).dnas)
    .flatten()
    .uniqBy(dna => dna.id)
    .value()
  
  const instances = _.chain(configs)
    .toPairs()
    .map(([name, c]) => 
      _.map(c.instances, (inst) => 
        _.chain(inst)
        .update('id', suffix(name))
        .update('agent', suffix(name))
        .update('storage.path', suffix(name))
        .value()
      )
    )
    .flatten()
    .value()

  const bridges = _.chain(configs)
    .toPairs()
    .map(([name, c]) => 
      _.map(c.bridges, b => _.chain(b)
        .update('caller_id', suffix(name))
        .update('callee_id', suffix(name))
        .value()
      )
    )
    .flatten()
    .value()
  
  
  const first = standard ? configs[standard] : _.values(configs)[0]
  
  const zomeInterfaceIndex = _.findIndex(first.interfaces, i => i.id === ZOME_INTERFACE_ID)
  const zomeInterfaceInstances = _.chain(configs)
    .toPairs()
    .map(([name, c]) => 
      _.map(
        c.interfaces[zomeInterfaceIndex].instances,
        i => _.update(i, 'id', suffix(name))
      )
    )
    .flatten()
    .value()

  const interfaces = _.set(
    first.interfaces,
    [zomeInterfaceIndex, 'instances'],
    zomeInterfaceInstances
  )

  const combined = _.assign(first, {
    agents,
    dnas,
    bridges,
    instances,
    interfaces,
  })

  return combined
}