import type {
  AdminWebsocket,
  AgentPubKey,
  AppAgentWebsocket,
  AppBundleSource,
  AppInfo,
  AppSignalCb,
  AppWebsocket,
  CallZomeRequest,
  ClonedCell,
  DnaBundle,
  DnaProperties,
  DnaSource,
  HoloHash,
  InstalledAppId,
  MembraneProof,
  ProvisionedCell,
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
 * AdminWebsocket interface for local and TryCP conductors.
 *
 * @public
 */
export type IAdminWebsocket = Omit<
  AdminWebsocket,
  "client" | "defaultTimeout" | "_requester"
>;

/**
 * AppWebsocket interface for local and TryCP conductors.
 *
 * @public
 */
export type IAppWebsocket = Pick<
  AppWebsocket,
  | "callZome"
  | "appInfo"
  | "createCloneCell"
  | "enableCloneCell"
  | "disableCloneCell"
  | "networkInfo"
  | "on"
>;

/**
 * AppAgentWebsocket interface for local and TryCP conductors.
 *
 * @public
 */
export type IAppAgentWebsocket = Pick<AppAgentWebsocket, "callZome" | "on">;

/**
 * Base interface of a Tryorama conductor. Both {@link Conductor} and
 * {@link TryCpConductor} implement this interface.
 *
 * @public
 */
export interface IConductor {
  startUp: () => Promise<void | null>;
  shutDown: () => Promise<number | null>;

  adminWs: () => IAdminWebsocket;
  connectAppWs: (port: number) => Promise<IAppWebsocket>;
  connectAppAgentWs: (
    port: number,
    appId: InstalledAppId
  ) => Promise<IAppAgentWebsocket>;

  installApp: (
    appBundleSource: AppBundleSource,
    options?: AppOptions
  ) => Promise<AppInfo>;
  installAgentsApps: (options: AgentsAppsOptions) => Promise<AppInfo[]>;
}

/**
 * The zome request options adapted to a specific cell.
 *
 * @public
 */
export type CellZomeCallRequest = Omit<
  CallZomeRequest,
  "cap_secret" | "cell_id" | "payload" | "provenance"
> & {
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
  appAgentWs: AppAgentWebsocket | IAppAgentWebsocket;
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
  /**
   * A signal handler for the conductor.
   */
  signalHandler?: AppSignalCb;
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
