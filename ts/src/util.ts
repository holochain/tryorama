import { Player } from "./local";
import { FullStateDump, DnaHash, encodeHashToBase64 } from "@holochain/client";
import isEqual from "lodash/isEqual.js";
import sortBy from "lodash/sortBy.js";

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
 * A utility function to compare players' integrated DhtOps.
 *
 * @param players - Array of players.
 * @param dnaHash - DNA to compare integrated DhtOps from.
 * @returns A promise that is resolved after players' Integrated DhtOps match.
 *
 * @public
 */
export const isIntegratedDhtOpsEqual = async (
  players: Array<Player>,
  dnaHash: DnaHash
) => {
  // Dump all players' states
  const playersStates: FullStateDump[] = await Promise.all(
    players.map((player) =>
      player.conductor.adminWs().dumpFullState({
        cell_id: [dnaHash, player.agentPubKey],
        dht_ops_cursor: undefined,
      })
    )
  );

  // Compare players' integrated DhtOps
  const playersDhtOpsIntegrated = playersStates.map((player) =>
    sortBy(player.integration_dump.integrated, [
      (op) => Object.keys(op)[0],
      (op) => encodeHashToBase64(Object.values(op)[0][0]),
    ])
  );
  const status = playersDhtOpsIntegrated.every((playerOps) =>
    isEqual(playerOps, playersDhtOpsIntegrated[0])
  );

  return status;
};

/**
 * A utility function to wait until all players' integrated DhtOps are identical for a DNA.
 *
 * @param players - Array of players.
 * @param dnaHash - DNA to compare integrated DhtOps from.
 * @param interval - Interval in milliseconds to pause between comparisons (defaults to 50 ms).
 * @param timeout - A timeout for the delay (optional).
 * @returns A promise that is resolved after all agents' DHT states match.
 *
 * @public
 */
export const awaitDhtIntegration = async (
  players: Array<Player>,
  dnaHash: DnaHash,
  interval = 50,
  timeout?: number
) => {
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
    completed = await isIntegratedDhtOpsEqual(players, dnaHash);

    if (!completed) await pause(interval);
  }
};
