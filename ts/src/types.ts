import {
  AdminWebsocket,
  AppWebsocket,
  CallZomeRequest,
  DnaSource,
  InstalledCell,
} from "@holochain/client";
import { ZomeResponsePayload } from "../test/fixture";
import { TryCpConductorLogLevel } from "./trycp";

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

export interface AgentCells {
  agentPubKey: Uint8Array;
  cells: Array<InstalledCell & { callZome: CallZomeFn }>;
}
export interface Conductor
  extends Pick<
      AdminWebsocket,
      | "generateAgentPubKey"
      | "registerDna"
      | "installApp"
      | "enableApp"
      | "attachAppInterface"
      | "requestAgentInfo"
      | "addAgentInfo"
      | "dumpState"
      | "dumpFullState"
    >,
    Pick<AppWebsocket, "callZome"> {
  startup: (log_level?: TryCpConductorLogLevel) => Promise<void | null>;
  shutdown: () => Promise<number | null>;

  // appInfo: (installed_app_id: string) => Promise<InstalledAppInfo | null>;

  callZome: <T extends ZomeResponsePayload>(
    request: CallZomeRequest
  ) => Promise<T>;

  installAgentsDnas: (options: {
    agentsDnas: DnaSource[][];
    uid?: string;
  }) => Promise<AgentCells[]>;
}
