import * as T from '../src/types'

export const genConfigArgs: () => Promise<T.GenConfigArgs> = async () => ({
  configDir: 'config/dir',
  adminPort: 1000,
  zomePort: 2000,
  conductorName: 'conductorName',
  uuid: 'uuid',
})
export const spawnConductor = (() => { }) as unknown as T.SpawnConductorFn