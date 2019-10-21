/**
 * Allows "parking" (and unparking) of ports.
 * getPorts will find a port which is not used by another process
 * AND has not beed parked.
 * This prevents port collisions when instantiating multiple conductor simultaneously,
 * as well as the chance of another process taking the port specified in a conductor config
 * in between killing and spawning the same conductor
 */

const PARKED_PORTS = new Set()

export const getPort = async () => {
  let port = null
  do {
    port = await require('get-port')()
  } while (PARKED_PORTS.has(port))
  return port
}

export const parkPort = port => PARKED_PORTS.add(port)
export const unparkPort = port => PARKED_PORTS.delete(port)
