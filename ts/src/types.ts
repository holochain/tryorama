import {
  AdminWebsocket,
  AgentPubKey,
  AppBundleSource,
  AppSignalCb,
  AppWebsocket,
  CallZomeRequest,
  DnaSource,
  InstalledCell,
  MembraneProof,
  RoleId,
} from "@holochain/client";

export type CellZomeCallRequest = Omit<
  CallZomeRequest,
  "cap_secret" | "cell_id" | "provenance"
> & {
  cap_secret?: Uint8Array;
  provenance?: Uint8Array;
};

export type CallZomeFn = <T>(request: CellZomeCallRequest) => Promise<T>;

export interface CallableCell extends InstalledCell {
  callZome: CallZomeFn;
}

export interface AgentHapp {
  happId: string;
  agentPubKey: Uint8Array;
  cells: CallableCell[];
  namedCells: Map<RoleId, InstalledCell>;
}

export interface HappBundleOptions {
  agentPubKey?: AgentPubKey;
  installedAppId?: string;
  uid?: string;
  membraneProofs?: Record<string, MembraneProof>;
}

export interface Conductor {
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
  appWs: () => Pick<AppWebsocket, "callZome" | "appInfo">;

  installAgentsHapps: (options: {
    agentsDnas: DnaSource[][];
    uid?: string;
    signalHandler?: AppSignalCb;
  }) => Promise<AgentHapp[]>;
}

export interface Scenario {
  addPlayerWithDnas(
    dnas: DnaSource[],
    signalHandler?: AppSignalCb
  ): Promise<Player>;
  addPlayersWithDnas(
    playersDnas: DnaSource[][],
    signalHandlers?: Array<AppSignalCb | undefined>
  ): Promise<Player[]>;
  addPlayerWithHappBundle(
    appBundleSource: AppBundleSource,
    options?: HappBundleOptions & { signalHandler?: AppSignalCb }
  ): Promise<Player>;
  addPlayersWithHappBundles(
    playersHappBundles: Array<{
      appBundleSource: AppBundleSource;
      options?: HappBundleOptions & { signalHandler?: AppSignalCb };
    }>
  ): Promise<Player[]>;
  cleanUp(): Promise<void>;
}

export interface Player {
  conductor: Conductor;
  agentPubKey: Uint8Array;
  cells: CallableCell[];
  namedCells: Map<RoleId, InstalledCell>;
}
