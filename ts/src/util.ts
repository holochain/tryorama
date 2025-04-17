import {
  CellId,
  DnaHash,
  FullStateDump,
  encodeHashToBase64,
} from "@holochain/client";
import isEqual from "lodash/isEqual.js";
import sortBy from "lodash/sortBy.js";
import sum from "lodash/sum.js";
import { Player } from "./scenario.js";
import { ConductorCell } from "./types.js";

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

const playersToConductorCells = (players: Player[], dnaHash: DnaHash) =>
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
export const areDhtsSynced = async (players: Player[], dnaHash: DnaHash) => {
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
  conductorCells: ConductorCell[]
) => {
  if (!isConductorCellDnaHashEqual(conductorCells)) {
    throw Error("Cannot compare DHT state of different DNAs");
  }

  // Dump all conductors' states
  const conductorStates: FullStateDump[] = await Promise.all(
    conductorCells.map((conductorCell) =>
      conductorCell.conductor.adminWs().dumpFullState({
        cell_id: conductorCell.cellId,
        dht_ops_cursor: undefined,
      })
    )
  );

  // Get total number of published DhtOps
  const totalPublishedDhtOpsCount = sum(
    conductorStates.map((state) => state.source_chain_dump.published_ops_count)
  );

  // Compare total number of published DhtOps to integrated DhtOps count in each conductor
  const allDhtOpsIntegrated = conductorStates.every(
    (state: FullStateDump) =>
      state.integration_dump.integrated.length === totalPublishedDhtOpsCount &&
      state.integration_dump.integration_limbo.length === 0 &&
      state.integration_dump.validation_limbo.length === 0
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
          return Buffer.from(Object.values(op.ChainOp)[0][0]).toString(
            "base64"
          );
        } else {
          // Sorting by signatures is sufficient for warrant ops.
        }
      },
    ]);
  });
  const allDhtOpsSynced = conductorDhtOpsIntegrated.every((ops) =>
    isEqual(ops, conductorDhtOpsIntegrated[0])
  );

  return allDhtOpsSynced && allDhtOpsIntegrated;
};

/**
 * A utility function to wait until all conductors' integrated DhtOps are
 * identical for a DNA.
 *
 * @param players - Array of players.
 * @param dnaHash - DNA hash to compare integrated DhtOps from.
 * @param timeoutMs - A timeout for the delay (defaults to 60000 milliseconds).
 * @returns A promise that is resolved after all agents' DHT states match.
 *
 * @public
 */
export const dhtSync = async (
  players: Player[],
  dnaHash: DnaHash,
  timeoutMs = 60000
) => {
  const conductorCells = playersToConductorCells(players, dnaHash);
  return conductorCellsDhtSync(conductorCells, 500, timeoutMs);
};

/**
 * A utility function to wait until all conductors' integrated DhtOps are
 * identical for a DNA.
 *
 * @param conductorCells - Array of ConductorCell.
 * @param interval - Interval to pause between comparisons (defaults to 50 ms).
 * @param timeout - A timeout for the delay (optional).
 * @returns A promise that is resolved after all agents' DHT states match.
 *
 * @public
 */
const conductorCellsDhtSync = async (
  conductorCells: ConductorCell[],
  intervalMs: number,
  timeoutMs: number
) => {
  if (!isConductorCellDnaHashEqual(conductorCells)) {
    throw Error("Cannot compare DHT state of different DNAs");
  }

  // Always run the check at least once, even if the timeoutMs is 0.
  let completed = await areConductorCellsDhtsSynced(conductorCells);

  const startTime = Date.now();
  while (!completed) {
    // Check if timeout has passed
    const currentTime = Date.now();
    if (Math.floor(currentTime - startTime) >= timeoutMs)
      throw Error(
        `Timeout of ${timeoutMs} ms has passed, but players integrated DhtOps are not syncronized`
      );

    // Check if Integrated DhtOps are syncronized
    completed = await areConductorCellsDhtsSynced(conductorCells);

    if (!completed) {
      await pause(intervalMs);
    }
  }
};

/**
 * A utility function to verify if all ConductorCells in an array have CellIds with
 * the same DnaHash.
 *
 * @param conductorCells - Array of ConductorCell.
 * @returns boolean
 *
 * @internal
 */
const isConductorCellDnaHashEqual = (conductorCells: ConductorCell[]) => {
  const dnaHashes = conductorCells.map(
    (conductorCell) => conductorCell.cellId[0]
  );
  return dnaHashes.every((val: DnaHash) => val === dnaHashes[0]);
};
