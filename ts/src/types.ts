import {
  AdminWebsocket,
  AppSignalCb,
  AppWebsocket,
  CallZomeRequest,
  DnaSource,
  InstalledCell,
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
  addPlayer(dnas: DnaSource[], signalHandler?: AppSignalCb): Promise<Player>;
  addPlayers(
    playersDnas: DnaSource[][],
    signalHandlers?: Array<AppSignalCb | undefined>
  ): Promise<Player[]>;
}

export interface Player {
  conductor: Conductor;
  agentPubKey: Uint8Array;
  cells: CallableCell[];
}
