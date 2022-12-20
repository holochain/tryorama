import {
  AdminWebsocket,
  AgentPubKey,
  AppBundleSource,
  AppSignalCb,
  AppWebsocket,
  CallZomeRequest,
  CapSecret,
  Cell,
  DnaBundle,
  DnaProperties,
  DnaSource,
  HoloHash,
  InstalledAppId,
  MembraneProof,
  RegisterDnaRequest,
  RoleName,
} from "@holochain/client";

/**
 * @internal
 */
export type _RegisterDnaReqOpts = Omit<
  RegisterDnaRequest,
  "hash" | "path" | "bundle"
> & {
  hash?: HoloHash;
  path?: string;
  bundle?: DnaBundle;
};

/**
 * The zome request options adapted to a specific cell.
 *
 * @public
 */
export type CellZomeCallRequest = Omit<
  CallZomeRequest,
  "cap_secret" | "cell_id" | "payload" | "provenance"
> & {
  cap_secret?: CapSecret;
  provenance?: AgentPubKey;
  payload?: unknown;
};

/**
 * The function for calling a zome from a specific cell.
 *
 * @public
 */
export type CallZomeFn = <T>(
  request: CellZomeCallRequest,
  timeout?: number
) => Promise<T>;

/**
 * Extends an installed cell by a function to call a zome.
 *
 * @public
 */
export interface CallableCell extends Cell {
  callZome: CallZomeFn;
}

/**
 * Provides direct access to cells of an app and the agent key.
 *
 * @public
 */
export interface AgentApp {
  appId: string;
  agentPubKey: Uint8Array;
  cells: CallableCell[];
  namedCells: Map<RoleName, CallableCell>;
}

/**
 * Combines an agent hApp with the conductor they belong to.
 *
 * @public
 */
export interface IPlayer extends AgentApp {
  conductor: IConductor;
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
   * Proofs of membership for the hApp.
   */
  membraneProofs?: Record<string, MembraneProof>;
}

/**
 * An app and an optional agent pub key for each agent. Optionally a network
 * seed to be used for DNA installation.
 *
 * @public
 */
export type AgentsAppsOptions = {
  agentsApps: Array<{ app: AppBundleSource } & AppOptions>;

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
 * Base interface of a Tryorama conductor. Both {@link Conductor} and
 * {@link TryCpConductor} implement this interface.
 *
 * @public
 */
export interface IConductor {
  startUp: () => Promise<void | null>;
  shutDown: () => Promise<number | null>;

  connectAppInterface(signalHandler?: AppSignalCb): void;

  adminWs: () => Omit<
    AdminWebsocket,
    "_requester" | "client" | "defaultTimeout"
  >;
  appWs: () => Pick<
    AppWebsocket,
    | "callZome"
    | "appInfo"
    | "createCloneCell"
    | "enableCloneCell"
    | "disableCloneCell"
  >;

  installApp: (
    appBundleSource: AppBundleSource,
    options?: AppOptions
  ) => Promise<AgentApp>;
  installAgentsApps: (options: AgentsAppsOptions) => Promise<AgentApp[]>;
}
