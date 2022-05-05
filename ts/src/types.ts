import {
  AdminWebsocket,
  AppSignalCb,
  AppWebsocket,
  CallZomeRequest,
  DnaSource,
  InstalledCell,
} from "@holochain/client";
import { ZomeResponsePayload } from "../test/fixture";

export type CellZomeCallRequest = Omit<
  CallZomeRequest,
  "cap_secret" | "cell_id" | "provenance"
> & {
  cap_secret?: Uint8Array;
  provenance?: Uint8Array;
};

export type CallZomeFn = <T extends ZomeResponsePayload>(
  request: CellZomeCallRequest
) => Promise<T>;

export interface CallableCell extends InstalledCell {
  callZome: CallZomeFn;
}

export interface AgentHapp {
  happId: string;
  agentPubKey: Uint8Array;
  cells: CallableCell[];
}

export interface Conductor
  extends Pick<
      AdminWebsocket,
      | "addAgentInfo"
      | "attachAppInterface"
      // | "createCloneCell"
      // | "disableApp"
      | "enableApp"
      | "dumpState"
      | "dumpFullState"
      | "generateAgentPubKey"
      | "installApp"
      // | "installAppBundle"
      // | "listAppInterfaces"
      // | "listApps"
      // | "listCellIds"
      // | "listDnas"
      | "registerDna"
      | "requestAgentInfo"
      // | "startApp"
      // | "uninstallApp"
    >,
    Pick<AppWebsocket, "callZome" | "appInfo"> {
  startUp: (options: { signalHandler?: AppSignalCb }) => Promise<void | null>;
  shutDown: () => Promise<number | null>;

  callZome: <T extends ZomeResponsePayload>(
    request: CallZomeRequest
  ) => Promise<T>;

  installAgentsHapps: (options: {
    agentsDnas: DnaSource[][];
    uid?: string;
  }) => Promise<AgentHapp[]>;
}

export type Player = {
  conductor: Conductor;
  agentPubKey: Uint8Array;
  cells: CallableCell[];
};
