import {
  CellId,
  DnaHash,
  FullStateDump,
  encodeHashToBase64,
} from "@holochain/client";
import isEqual from "lodash/isEqual.js";
import sortBy from "lodash/sortBy.js";
import { IConductorCell, IPlayer } from "./types.js";

/**
 * A utility function to wait the given amount of time.
 *
 * @param milliseconds - The number of milliseconds to wait.
 * @returns A promise that is resolved after the given amount of milliseconds.
 *
 * @public
 */
export const pause = (milliseconds: number) => {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
};

const playersToConductorCells = (players: IPlayer[], dnaHash: DnaHash) =>
  players.map((player) => ({
    conductor: player.conductor,
    cellId: [dnaHash, player.agentPubKey] as CellId,
  }));

/**
 * A utility function to compare conductors' integrated DhtOps.
 *
 * @param conductors - Array of conductors.
 * @param cellId - Cell id to compare integrated DhtOps from.
 * @returns A promise that is resolved after conductors' Integrated DhtOps match.
 *
 * @public
 */
export const areDhtsSynced = async (players: IPlayer[], dnaHash: DnaHash) => {
  const conductorCells = playersToConductorCells(players, dnaHash);
  return areConductorCellsDhtsSynced(conductorCells);
};

/**
 * A utility function to compare conductors' integrated DhtOps.
 *
 * @param conductorCells - Array of ConductorCells
 * @returns A promise that is resolved after conductors' Integrated DhtOps match.
 *
 * @public
 */
export const areConductorCellsDhtsSynced = async (
  conductorCells: IConductorCell[]
) => {
  if (!isConductorCellDnaHashEqual(conductorCells)) {
    throw Error("Cannot compare DHT state of different DNAs");
  }

  // Dump all conductors' states
  const conductorStates: FullStateDump[] = await Promise.all(
    conductorCells.map((conductorCell) => {
      return conductorCell.conductor.adminWs().dumpFullState({
        cell_id: conductorCell.cellId,
        dht_ops_cursor: undefined,
      });
    })
  );

  // Compare conductors' integrated DhtOps
  const conductorDhtOpsIntegrated = conductorStates.map((conductor) => {
    return sortBy(conductor.integration_dump.integrated, [
      // There are chain and warrant ops
      (op) => {
        if ("ChainOp" in op) {
          // Sort chain ops by op type (e. g. StoreEntry).
          return Object.keys(op.ChainOp)[0];
        } else {
          // Sort warrant ops by signature.
          return encodeHashToBase64(op.WarrantOp.signature);
        }
      },
      (op) => {
        if ("ChainOp" in op) {
          // Secondly sort by chain op signature.
          return Buffer.from(Object.values(op.ChainOp)[0][0]).toString('base64');
        } else {
          // Sorting by signatures is sufficient for warrant ops.
        }
      },
    ]);
  });
  const status = conductorDhtOpsIntegrated.every((ops) =>
    isEqual(ops, conductorDhtOpsIntegrated[0])
  );

  return status;
};

/**
 * A utility function to wait until all conductors' integrated DhtOps are
 * identical for a DNA.
 *
 * @param players - Array of players.
 * @param dnaHash - DNA hash to compare integrated DhtOps from.
 * @param interval - Interval to pause between comparisons (defaults to 50 ms).
 * @param timeout - A timeout for the delay (optional).
 * @returns A promise that is resolved after all agents' DHT states match.
 *
 * @public
 */
export const dhtSync = async (
  players: IPlayer[],
  dnaHash: DnaHash,
  interval = 50,
  timeout?: number
) => {
  const conductorCells = playersToConductorCells(players, dnaHash);
  return conductorCellsDhtSync(conductorCells, interval, timeout);
};

/**
 * A utility function to wait until all conductors' integrated DhtOps are
 * identical for a DNA.
 *
 * @param conductorCells - Array of IConductorCell.
 * @param interval - Interval to pause between comparisons (defaults to 50 ms).
 * @param timeout - A timeout for the delay (optional).
 * @returns A promise that is resolved after all agents' DHT states match.
 *
 * @public
 */
export const conductorCellsDhtSync = async (
  conductorCells: IConductorCell[],
  interval = 50,
  timeout?: number
) => {
  if (!isConductorCellDnaHashEqual(conductorCells)) {
    throw Error("Cannot compare DHT state of different DNAs");
  }

  const startTime = performance.now();
  let completed = false;

  while (!completed) {
    // Check if timeout has passed
    const currentTime = performance.now();
    if (timeout && Math.floor((currentTime - startTime) * 1000) >= timeout)
      throw Error(
        `Timeout of ${timeout} ms has passed, but players integrated DhtOps are not syncronized`
      );

    // Check if Integrated DhtOps are syncronized
    completed = await areConductorCellsDhtsSynced(conductorCells);

    if (!completed) {
      await pause(interval);
    }
  }
};

/**
 * A utility function to verify if all IConductorCells in an array have CellIds with
 * the same DnaHash.
 *
 * @param conductorCells - Array of IConductorCell.
 * @returns boolean
 *
 * @internal
 */
const isConductorCellDnaHashEqual = (conductorCells: IConductorCell[]) => {
  const dnaHashes = conductorCells.map(
    (conductorCell) => conductorCell.cellId[0]
  );
  return dnaHashes.every((val: DnaHash) => val === dnaHashes[0]);
};
