import {
  CellId,
  DhtArc,
  DnaHash,
  DumpNetworkMetricsResponse,
  FullStateDump,
  LocalAgentSummary,
  encodeHashToBase64,
} from "@holochain/client";
import isEqual from "lodash/isEqual.js";
import sortBy from "lodash/sortBy.js";
import { PlayerApp } from "./scenario.js";
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

/**
 *
 * A utility function to wait until a given function `isComplete` returns `true` for a given `input`,
 * or a timeout is reached.
 *
 * If the timeout is reached, then throws an error containing the string returned by the given function `onTimeoutMessage`.
 *
 * @param isCompletedFn - Function to run on an interval, until the result is `true`.
 * @param onTimeoutMessage - Function that generates a string message which will be logged and thrown when the timeout is reached.
 * @param input - The input parameters to pass to `isCompletedFn` and `isCompletedFn`.
 * @param intervalMs -  Interval to pause between isCompleted runs (defaults to 500 milliseconds).
 * @param timeoutMs - A timeout for the delay (defaults to 60000 milliseconds).
 */
const retryUntilCompleteOrTimeout = async <T>(
  isComplete: (input: T) => Promise<boolean>,
  onTimeoutMessage: (input: T) => Promise<string>,
  input: T,
  intervalMs: number = 500,
  timeoutMs: number = 60000,
) => {
  // Always run the check at least once, even if the timeoutMs is 0.
  let completed = await isComplete(input);

  const startTime = Date.now();
  while (!completed) {
    // Check if timeout has passed
    const currentTime = Date.now();
    if (Math.floor(currentTime - startTime) >= timeoutMs) {
      const timeoutMessage = await onTimeoutMessage(input);
      const failureMessage = `Timeout of ${timeoutMs} ms has passed. ${timeoutMessage}`;

      console.error(failureMessage);
      throw Error(failureMessage);
    }

    completed = await isComplete(input);

    if (!completed) {
      await pause(intervalMs);
    }
  }
};

const playerAppsToConductorCells = (players: PlayerApp[], dnaHash: DnaHash) =>
  players.map((playerApp) => ({
    conductor: playerApp.conductor,
    cellId: [dnaHash, playerApp.agentPubKey] as CellId,
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
export const areDhtsSynced = async (
  playerApps: PlayerApp[],
  dnaHash: DnaHash,
) => {
  const conductorCells = playerAppsToConductorCells(playerApps, dnaHash);
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
  conductorCells: ConductorCell[],
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
      }),
    ),
  );

  // Determine if all published ops are integrated in every conductor, and none are in limbo
  const limbosEmpty = conductorStates.every(
    (state: FullStateDump) =>
      state.integration_dump.integration_limbo.length === 0 &&
      state.integration_dump.validation_limbo.length === 0,
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
            "base64",
          );
        } else {
          // Sorting by signatures is sufficient for warrant ops.
        }
      },
    ]);
  });
  const allDhtOpsSynced = conductorDhtOpsIntegrated.every((ops) =>
    isEqual(ops, conductorDhtOpsIntegrated[0]),
  );

  return allDhtOpsSynced && limbosEmpty;
};

/**
 * A utility function to wait until all conductors' DhtOps have been integrated,
 * and are identical for a given DNA.
 *
 * @param players - Array of players.
 * @param dnaHash - DNA hash to compare integrated DhtOps from.
 * @param intervalMs - Interval to pause between comparisons (defaults to 500 milliseconds).
 * @param timeoutMs - A timeout for the delay (defaults to 60000 milliseconds).
 * @returns A promise that is resolved after all agents' DHT states match.
 *
 * @public
 */
export const dhtSync = async (
  players: PlayerApp[],
  dnaHash: DnaHash,
  intervalMs = 500,
  timeoutMs = 60000,
) =>
  retryUntilCompleteOrTimeout(
    ({ players, dnaHash }) => {
      const conductorCells = playerAppsToConductorCells(players, dnaHash);
      return areConductorCellsDhtsSynced(conductorCells);
    },
    async ({ players, dnaHash }) => {
      const conductorCells = playerAppsToConductorCells(players, dnaHash);
      const conductorStates: FullStateDump[] = await Promise.all(
        conductorCells.map((conductorCell) =>
          conductorCell.conductor.adminWs().dumpFullState({
            cell_id: conductorCell.cellId,
            dht_ops_cursor: undefined,
          }),
        ),
      );

      console.error(
        conductorStates.map(
          (dump, idx) => `
Conductor ${idx}
------------------------------
# of integrated ops: ${dump.integration_dump.integrated.length}
# of ops in integration limbo: ${dump.integration_dump.integration_limbo.length}
# of ops in validation limbo: ${dump.integration_dump.validation_limbo.length}\n`,
        ),
      );

      return `Players' integrated DhtOps are not syncronized.`;
    },
    { players, dnaHash },
    intervalMs,
    timeoutMs,
  );

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
    (conductorCell) => conductorCell.cellId[0],
  );
  return dnaHashes.every((val: DnaHash) => val === dnaHashes[0]);
};

/**
 * A utility function to wait until a player's storage arc matches a desired
 * storage arc for a DNA
 *
 * @param player - A Player.
 * @param dnaHash - The DNA to check the storage arc for.
 * @param storageArc - The desired storage DhtArc to wait for.
 * @param intervalMs - Interval between comparisons in milliseconds (default 500).
 * @param timeoutMs - Timeout in milliseconds (default 40_000).
 * @returns A promise that resolves when the player's storage arc matches; rejects on timeout.
 *
 * @public
 */
export const storageArc = async (
  player: PlayerApp,
  dnaHash: DnaHash,
  storageArc: DhtArc,
  intervalMs = 500,
  timeoutMs = 40_000,
) =>
  retryUntilCompleteOrTimeout(
    ({ player, dnaHash, storageArc }) =>
      isEqualPlayerStorageArc(player, dnaHash, storageArc),
    async ({ player, dnaHash, storageArc }) => {
      const currentStorageArc = await getPlayerStorageArc(player, dnaHash);
      return `Player's storage arc did not match the desired storage arc ${storageArc}. Final storage arc: ${currentStorageArc}`;
    },
    { player, dnaHash, storageArc },
    intervalMs,
    timeoutMs,
  );

/**
 * A utility function to get the storage arc for a given player and dna hash.
 *
 * @param player - A Player.
 * @param dnaHash - The DNA to get the storage arc for.
 * @returns A Promise containing the storage DhtArc
 *
 * @public
 */
export const getPlayerStorageArc = async (
  player: PlayerApp,
  dnaHash: DnaHash,
): Promise<DhtArc> => {
  const networkMetrics: DumpNetworkMetricsResponse =
    await player.appWs.dumpNetworkMetrics({
      dna_hash: dnaHash,
      include_dht_summary: false,
    });

  const dnaHashB64 = encodeHashToBase64(dnaHash);
  if (networkMetrics[dnaHashB64] === undefined) {
    throw new Error(`DNA ${dnaHashB64} was not included in NetworkMetrics`);
  }

  const networkAgentSummary = networkMetrics[dnaHashB64].local_agents.find(
    (l: LocalAgentSummary) => isEqual(l.agent, player.agentPubKey),
  );

  if (networkAgentSummary === undefined) {
    throw new Error(
      `Agent ${encodeHashToBase64(player.agentPubKey)} was not included in NetworkMetrics local_agents`,
    );
  }

  return networkAgentSummary.storage_arc;
};

/**
 * A utility function to get the storage arc for a given player and dna hash,
 * and then compare it to a desired storage arc.
 *
 * @param player - A Player.
 * @param dnaHash - The DNA to get the storage arc for.
 * @param storageArc - The desired storage DhtArc to compare to.
 * @returns boolean
 *
 * @internal
 */
const isEqualPlayerStorageArc = async (
  player: PlayerApp,
  dnaHash: DnaHash,
  storageArc: DhtArc,
): Promise<boolean> => {
  const currentStorageArc = await getPlayerStorageArc(player, dnaHash);
  return isEqual(currentStorageArc, storageArc);
};

/**
 * A utility function to wait until a player's integrated Ops count equals a desired
 * count for a DNA
 *
 * @param player - A Player.
 * @param cellId - The Cell to check the integrated Ops count for.
 * @param targetIntegratedOpsCount - The desired integrated Ops count to wait for.
 * @param intervalMs - Interval between comparisons in milliseconds (default 500).
 * @param timeoutMs - Timeout in milliseconds (default 40_000).
 * @returns A promise that resolves when the player's integrated ops count matches; rejects on timeout.
 *
 * @public
 */
export const integratedOpsCount = async (
  player: PlayerApp,
  cellId: CellId,
  targetIntegratedOpsCount: number,
  intervalMs = 500,
  timeoutMs = 40_000,
) =>
  retryUntilCompleteOrTimeout(
    async ({ player, cellId, targetIntegratedOpsCount }) => {
      const playerFullState: FullStateDump = await player.conductor
        .adminWs()
        .dumpFullState({
          cell_id: cellId,
          dht_ops_cursor: undefined,
        });

      return (
        playerFullState.integration_dump.integrated.length ===
        targetIntegratedOpsCount
      );
    },
    async ({ player, cellId, targetIntegratedOpsCount }) => {
      const dump: FullStateDump = await player.conductor
        .adminWs()
        .dumpFullState({
          cell_id: cellId,
          dht_ops_cursor: undefined,
        });

      console.error(`
Conductor
------------------------------
# of integrated ops: ${dump.integration_dump.integrated.length}
# of ops in integration limbo: ${dump.integration_dump.integration_limbo.length}
# of ops in validation limbo: ${dump.integration_dump.validation_limbo.length}\n`);

      return `Target Integrated Ops Count: ${targetIntegratedOpsCount}, Current Integrated Ops Count: ${dump.integration_dump.integrated.length}`;
    },
    { player, cellId, targetIntegratedOpsCount },
    intervalMs,
    timeoutMs,
  );
