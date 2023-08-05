/**
 * Tryorama
 *
 * Tools for managing Holochain {@link @holochain/tryorama#Conductor | Conductors}
 * and {@link @holochain/tryorama#TryCpConductor | TryCP Conductors}.
 *
 * @remarks
 * TryCP stands for Tryorama Control Protocol (TryCP) and is a protocol to
 * enable remote management of Holochain conductors on network hosts.
 *
 * @packageDocumentation
 */
export * from "./local/index.js";
export * from "./trycp/index.js";
export {
  addAllAgentsToAllConductors,
  enableAndGetAgentApp,
  getZomeCaller,
} from "./common.js";
export * from "./types.js";
export * from "./util.js";
