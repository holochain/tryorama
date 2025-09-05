import type {
  AgentPubKey,
  CallZomeRequest,
  CellId,
  ClonedCell,
  DnaProperties,
  DnaSource,
  InstalledAppId,
  MembraneProof,
  ProvisionedCell,
  RoleName,
  RoleSettingsMap,
  SignalCb,
} from "@holochain/client";
import { Conductor, NetworkConfig } from "./conductor.js";
import { AppWithOptions } from "./scenario.js";

/**
 * The zome request options adapted to a specific cell.
 *
 * @public
 */
export type CellZomeCallRequest = Omit<
  CallZomeRequest,
  "cap_secret" | "cell_id"
>;

/**
 * The function for calling a zome from a specific cell.
 *
 * @public
 */
export type CallZomeFn = <T>(
  request: CellZomeCallRequest,
  timeout?: number,
) => Promise<T>;

/**
 * Extends an installed cell by a function to call a zome.
 *
 * @public
 */
export type CallableCell = Pick<
  ClonedCell | ProvisionedCell,
  "name" | "cell_id" | "dna_modifiers"
> &
  Partial<ClonedCell> &
  Partial<ProvisionedCell> & { callZome: CallZomeFn };

/**
 * Provides direct access to cells of an app and the agent key.
 *
 * @public
 */
export interface AgentApp {
  appId: string;
  agentPubKey: AgentPubKey;
  cells: CallableCell[];
  namedCells: Map<RoleName, CallableCell>;
}

/**
 * Optional arguments when installing a hApp.
 *
 * @public
 */
export interface AppOptions {
  agentPubKey?: AgentPubKey;
  /**
   * App ID to override the app manifest's app name.
   */
  installedAppId?: string;
  /**
   * A network seed to override the hApps' network seed.
   */
  networkSeed?: string;
  /**
   * Role specific settings or modifiers that will override any settings in the hApp's dna manifest(s).
   */
  rolesSettings?: RoleSettingsMap;
  /**
   * A signal handler for the conductor.
   */
  signalHandler?: SignalCb;
  /**
   * Network config for the player.
   */
  networkConfig?: NetworkConfig;
}

/**
 * An app and an optional agent pub key for each agent. Optionally a network
 * seed to be used for DNA installation.
 *
 * @public
 */
export type AgentsAppsOptions = {
  agentsApps: AppWithOptions[];

  /**
   * A unique ID for the DNAs (optional).
   */
  networkSeed?: string;

  /**
   * A unique ID for the hApp (optional).
   */
  installedAppId?: InstalledAppId;
};

/**
 * DNA source and additional options.
 *
 * @public
 */
export interface Dna {
  source: DnaSource;
  membraneProof?: MembraneProof;
  properties?: DnaProperties;
  roleName?: string;
}

/**
 * A Conductor and a CellId
 *
 * @public
 */
export interface ConductorCell {
  conductor: Conductor;
  cellId: CellId;
}
