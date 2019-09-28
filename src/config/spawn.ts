
import { spawn, execSync, ChildProcess } from "child_process";
import logger, { makeLogger } from "../logger";

export const spawnUnique = async (name, configPath): Promise<ChildProcess> => {

  let handle
  try {
    const binPath = process.env.TRYORAMA_HOLOCHAIN_PATH || 'holochain'
    const version = execSync(`${binPath} --version`)
    logger.info("Using conductor path: %s", binPath)
    logger.info("Holochain version: %s", version)
    handle = spawn(binPath, ['-c', configPath], {
      env: {
        ...process.env,
        "N3H_QUIET": "1",
        "RUST_BACKTRACE": "1",
      }
    })

    let plainLogger = makeLogger()

    handle.stdout.on('data', data => plainLogger.info(getFancy(`[[[CONDUCTOR ${name}]]]\n${data.toString('utf8')}`)))
    handle.stderr.on('data', data => plainLogger.error(getFancy(`{{{CONDUCTOR ${name}}}}\n${data.toString('utf8')}`)))
    return Promise.resolve(handle)
    // NB: the code to await for the interfaces to start up has been moved
    // to Player::_awaitConductorInterfaceStartup, so that we have access
    // to the handle immediately. Consequently this no longer needs to be
    // a Promise that's returned. So, kind of a TODO.
  } catch (err) {
    return Promise.reject(err)
  }
}

const bullets = "☉★☯⛬☸⛰☮⚽"
let currentBullet = 0

const getFancy = (output) => {
  const bullet = bullets[currentBullet]
  currentBullet = (currentBullet + 1) % bullets.length
  const indented = output.split('\n').join(`\n${bullet} `)
  return `\n${bullet}${bullet}${bullet} ${indented}`
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