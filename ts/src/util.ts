import { CellId, FullStateDump, encodeHashToBase64 } from "@holochain/client";
import isEqual from "lodash/isEqual.js";
import sortBy from "lodash/sortBy.js";
import { IConductor } from "./types.js";

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
 * A utility function to compare conductors' integrated DhtOps.
 *
 * @param conductors - Array of conductors.
 * @param cellId - Cell id to compare integrated DhtOps from.
 * @returns A promise that is resolved after conductors' Integrated DhtOps match.
 *
 * @public
 */
export const areDhtsSynced = async (
  conductors: Array<IConductor>,
  cellId: CellId
) => {
  // Dump all conductors' states
  const conductorStates: FullStateDump[] = await Promise.all(
    conductors.map((conductor) =>
      conductor.adminWs().dumpFullState({
        cell_id: cellId,
        dht_ops_cursor: undefined,
      })
    )
  );

  // Compare conductors' integrated DhtOps
  const playersDhtOpsIntegrated = conductorStates.map((conductor) =>
    sortBy(conductor.integration_dump.integrated, [
      // the only property's key of each DhtOp is the DhtOp type
      (op) => Object.keys(op)[0],
      // the DhtOp's signature
      (op) => encodeHashToBase64(Object.values(op)[0][0]),
    ])
  );
  const status = playersDhtOpsIntegrated.every((playerOps) =>
    isEqual(playerOps, playersDhtOpsIntegrated[0])
  );

  return status;
};

/**
 * A utility function to wait until all conductors' integrated DhtOps are
 * identical for a DNA.
 *
 * @param conductors - Array of conductors.
 * @param cellId - Cell id to compare integrated DhtOps from.
 * @param interval - Interval to pause between comparisons (defaults to 50 ms).
 * @param timeout - A timeout for the delay (optional).
 * @returns A promise that is resolved after all agents' DHT states match.
 *
 * @public
 */
export const awaitDhtSync = async (
  conductors: Array<IConductor>,
  cellId: CellId,
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
    completed = await areDhtsSynced(conductors, cellId);

    if (!completed) {
      await pause(interval);
    }
  }
};
