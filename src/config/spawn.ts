
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
  } catch (err) {
    return Promise.reject(err)
  }
  
  return new Promise((resolve, reject) => {
    handle.on('close', code => {
      logger.info(`conductor '${name}' exited with code ${code}`)
      reject(`Conductor exited before fully starting (code ${code})`)
    })
    handle.stdout.on('data', data => {
      // wait for the logs to convey that the interfaces have started
      // because the consumer of this function needs those interfaces
      // to be started so that it can initiate, and form,
      // the websocket connections
      if (data.toString('utf8').indexOf('Starting interfaces...') >= 0) {
        logger.info(`Conductor '${name}' process spawning successful`)
        resolve(handle)
      }
    })
  })
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