/**
 * Allows "parking" (and unparking) of ports.
 * getPorts will find a port which is not used by another process
 * AND has not beed parked.
 * This prevents port collisions when instantiating multiple conductor simultaneously,
 * as well as the chance of another process taking the port specified in a conductor config
 * in between killing and spawning the same conductor
 */

import { Mutex } from 'async-mutex'

const getPortRaw = require('get-port')

const portMutex = new Mutex()
const PARKED_PORTS = new Set()

const PORT_RANGE = [33000, 34000]

let nextPort = PORT_RANGE[0]

export const getPort = () => portMutex.runExclusive(async () => {
  let port = null
  do {
    port = await getPortRaw({ port: getPortRaw.makeRange(nextPort, PORT_RANGE[1]) })
    nextPort += 1
    if (nextPort >= PORT_RANGE[1]) {
      nextPort = PORT_RANGE[0]
    }
  } while (PARKED_PORTS.has(port))
  PARKED_PORTS.add(port)
  return port
})

// export const parkPort = port => PARKED_PORTS.add(port)
export const unparkPort = port => PARKED_PORTS.delete(port)
