import {
  AdminWebsocket,
  AgentPubKey,
  AppSignalCb,
  AppWebsocket,
  CallZomeRequest,
  CapSecret,
  DnaProperties,
  DnaSource,
  DnaBundle,
  HoloHash,
  InstalledCell,
  MembraneProof,
  RoleId,
  RegisterDnaRequest,
  InstalledAppId,
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
export interface CallableCell extends InstalledCell {
  callZome: CallZomeFn;
}

/**
 * Provides direct access to cells of a hApp and the agent key.
 *
 * @public
 */
export interface AgentHapp {
  happId: string;
  agentPubKey: Uint8Array;
  cells: CallableCell[];
  namedCells: Map<RoleId, CallableCell>;
}

/**
 * Combines an agent hApp with the conductor they belong to.
 *
 * @public
 */
export interface IPlayer extends AgentHapp {
  conductor: IConductor;
}

/**
 * Optional arguments when installing a hApp bundle.
 *
 * @public
 */
export interface HappBundleOptions {
  agentPubKey?: AgentPubKey;
  installedAppId?: string;
  networkSeed?: string;
  membraneProofs?: Record<string, MembraneProof>;
}

/**
 * DNA source and additional options.
 *
 * @public
 */
export interface Dna {
  source: DnaSource;
  membraneProof?: MembraneProof;
  properties?: DnaProperties;
  roleId?: string;
}

/**
 * DNAs per agent. Optionally an agent pub key.
 *
 * @public
 */
export interface AgentDnas {
  dnas: Dna[];
  agentPubKey?: AgentPubKey;
}

/**
 * An array of DNA sources for each agent (2-dimensional array) or an array of DNAs
 * and an optional agent pub key. Optionally a network seed to be used for DNA installation.
 *
 * @public
 */
export type AgentsHappsOptions =
  | DnaSource[][]
  | {
      agentsDnas: AgentDnas[];

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
 * Player installation options used in scenarios.
 *
 * Specifies either only the DNA sources that the hApp to be installed
 * consists of, or the DNAs and a signal handler to be registered.
 *
 * @public
 */
export type PlayerHappOptions =
  | DnaSource[]
  | {
      dnas: Dna[];
      signalHandler?: AppSignalCb;
    };

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
    | "_requester"
    | "client"
    | "activateApp"
    | "deactivateApp"
    | "defaultTimeout"
    | "listActiveApps"
  >;
  appWs: () => Pick<
    AppWebsocket,
    "callZome" | "appInfo" | "createCloneCell" | "archiveCloneCell"
  >;

  installAgentsHapps: (options: AgentsHappsOptions) => Promise<AgentHapp[]>;
}
