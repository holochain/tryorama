
import { spawn, ChildProcess } from "child_process";
import logger from "../logger";

export const spawnUnique = async (name, configPath): Promise<ChildProcess> => {

  let handle
  try {
    const binPath = process.env.TRYORAMA_HOLOCHAIN_PATH || 'holochain'
    handle = spawn(binPath, ['-c', configPath], {
      env: {
        ...process.env,
        "N3H_QUIET": "1",
        "RUST_BACKTRACE": "1",
      }
    })

    handle.stdout.on('data', data => logger.info(`[C '${name}'] %s`, data.toString('utf8')))
    handle.stderr.on('data', data => logger.error(`!C '${name}'! %s`, data.toString('utf8')))
    return Promise.resolve(handle)
    // NB: the code to await for the interfaces to start up has been moved
    // to Player::_awaitConductorInterfaceStartup, so that we have access
    // to the handle immediately. Consequently this no longer needs to be
    // a Promise that's returned. So, kind of a TODO.
  } catch (err) {
    return Promise.reject(err)
  }
}


/** 
 * Only spawn one conductor per "name", to be used for entire test suite
 * TODO: disable `.kill()` and `.spawn()` in scenario API
 */
export const memoizedSpawner = () => {
  const memomap = {}
  return (name, configPath): Promise<ChildProcess> => {
    if (!(name in memomap)) {
      memomap[name] = spawnUnique(name, configPath)
    }
    return memomap[name]
  }
}