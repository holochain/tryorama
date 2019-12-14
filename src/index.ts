
import ConfigBuilder from './config/builder'
export const Config = ConfigBuilder

export { Orchestrator, Register } from './orchestrator'
export { Player } from './player'
export { Instance } from './instance'
export * from './middleware'
export * from './types'

import logger from './logger'
import env from './env'

logger.info("Using the following settings from environment variables:")
logger.info(JSON.stringify(env, null, 2))
