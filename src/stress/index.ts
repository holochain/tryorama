import * as R from 'ramda'

import { Player } from '../player'
import { Instance } from '../instance'
import { DnaConfig, ConductorConfig, SugaredConductorConfig } from '../types'

/**
 * Takes an object whose keys correspond to array indices,
 * and construct a true array
 */
const indexedObjectToArray = <T>(o: { [n: string]: T }): Array<T> => {
  const r = (arr, pair) => {
    arr[pair[0]] = pair[1]
    return arr
  }

  return R.pipe(
    R.toPairs,
    R.reduce(r, []),
  )(o)
}

const trace = R.tap(<A>(x: A) => console.log('{T} ', x))

/**
 * Construct an array of N conductor configs,
 * each with M identical instances,
 * using the specified DNA.
 * Note that the instance IDs are *strings*, from '0' to M
 */
export const configBatchSimple = (numConductors: number, numInstances: number, dna: DnaConfig): Array<SugaredConductorConfig> => {
  const conductor: SugaredConductorConfig = R.pipe(
    R.reduce((o, n) => R.assoc(String(n), dna, o), {}),
    x => ({ instances: x }),
  )(R.range(0, numInstances))
  return R.repeat(conductor, numConductors)
}

type IterationMode = 'series' | 'parallel'
type Mapper = <A, B>(arr: Array<A>, f: (a: A) => Promise<B>) => Promise<Array<B>>
type InstanceWithPlayer = Instance & { player: Player }
type Predicate<A> = (a: A, i: number, arr: Array<A>) => boolean

const composePredicates = <T>(a: Predicate<T>, b: Predicate<T>): Predicate<T> => (...x) => a(...x) && b(...x)

export const mapSeries: Mapper = <A, B>(arr: Array<A>, f: (a: A) => Promise<B>): Promise<Array<B>> => {
  let current = Promise.resolve() as unknown as Promise<B>
  return Promise.all(arr.map(a => {
    current = current.then(() => f(a))
    return current
  }))
}

export const mapParallel: Mapper = <A, B>(arr: Array<A>, f: (a: A) => Promise<B>): Promise<Array<B>> => {
  return Promise.all(arr.map(f))
}

const mappers = {
  'series': mapSeries,
  'parallel': mapParallel,
}

const getMapper = (mode: IterationMode): Mapper => {
  const mapper = mappers[mode]
  if (!mapper) {
    throw new Error(`Unrecognized IterationMode: ${mode}`)
  }
  return mapper
}

export class Batch {
  members: Array<Player>
  _playerFilter: Predicate<Player>
  _instanceFilter: Predicate<InstanceWithPlayer>
  _mapper: Mapper

  constructor(members: Array<Player>) {
    this.members = members
    this._playerFilter = (...x) => true
    this._instanceFilter = (...x) => true
    this._mapper = mapSeries
  }

  players = (predicate: Predicate<Player>): Batch => R.assoc(
    '_playerFilter', composePredicates(predicate, this._playerFilter), this
  )

  instances = (predicate: Predicate<InstanceWithPlayer>): Batch => R.assoc(
    '_instanceFilter', composePredicates(predicate, this._instanceFilter), this
  )

  iteration = (mode: IterationMode): Batch => R.assoc(
    '_mapper', getMapper(mode), this
  )

  mapPlayers = <A>(fn: (p: Player) => Promise<A>): Promise<Array<A>> => {
    return this._mapper(this.members.filter(this._playerFilter), fn)
  }

  mapInstances = <A>(fn: (i: InstanceWithPlayer) => Promise<A>): Promise<Array<A>> => {
    const instances = R.flatten(
      this.members
        .filter(this._playerFilter)
        .map(player => player
          .instances(this._instanceFilter)
          .map(i => R.assoc('player', player, trace(i)))
        )
    )
    return this._mapper(instances, fn)
  }
}
