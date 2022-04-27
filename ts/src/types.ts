import {
  AdminWebsocket,
  AppWebsocket,
  CallZomeRequest,
  CellId,
  DnaSource,
} from "@holochain/client";
import { ZomeResponsePayload } from "../test/fixture";
import { TryCpConductorLogLevel } from "./trycp";

export interface AgentCell {
  agentPubKey: Uint8Array;
  cellId: CellId;
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

  installAgentsDnas: (dnas: DnaSource[]) => Promise<AgentCell[]>;
}
