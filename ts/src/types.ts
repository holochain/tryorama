import {
  AdminWebsocket,
  AgentInfoSigned,
  AgentPubKey,
  AppWebsocket,
  AttachAppInterfaceRequest,
  AttachAppInterfaceResponse,
  CallZomeRequest,
  CellId,
  DnaHash,
  DnaSource,
  EnableAppRequest,
  EnableAppResponse,
  InstallAppRequest,
  InstallAppResponse,
  InstalledAppId,
  InstalledAppInfo,
} from "@holochain/client";
import { ZomeResponsePayload } from "../test/fixture";
import { TryCpConductorLogLevel } from "./trycp";

export interface Conductor
  extends Pick<
      AdminWebsocket,
      "generateAgentPubKey" | "installApp" | "enableApp" | "attachAppInterface"
    >,
    Pick<AppWebsocket, "callZome"> {
  shutdown: () => Promise<number | null>;

  // saveDna: (dnaContent: Buffer) => Promise<string>;
  // configure: (partialConfig?: string) => Promise<null>;
  startup: (log_level?: TryCpConductorLogLevel) => Promise<void | null>;

  // callAdminApi: (message: RequestAdminInterfaceData) => Promise<string>;
  generateAgentPubKey: () => Promise<AgentPubKey>;
  // requestAgentInfo: (cellId?: CellId) => Promise<AgentInfoSigned[]>;
  // registerDna: (path: string) => Promise<DnaHash>;

  installApp: (request: InstallAppRequest) => Promise<InstallAppResponse>;
  enableApp: (request: EnableAppRequest) => Promise<EnableAppResponse>;

  attachAppInterface: (
    request?: AttachAppInterfaceRequest
  ) => Promise<AttachAppInterfaceResponse>;

  // addAgentInfo: (
  //   signedAgentInfos: AgentInfoSigned[]
  // ) => Promise<{ type: "agent_info_added" }>;
  // //  callAppApi: (message: RequestCallAppInterfaceMessage) => Promise<Uint8Array>;
  // appInfo: (installed_app_id: string) => Promise<InstalledAppInfo | null>;

  callZome: <T extends ZomeResponsePayload>(
    request: CallZomeRequest
  ) => Promise<T>;

  // installAgentsDnas: (
  //   dnas: DnaSource[]
  // ) => Promise<Array<{ agentPubKey: AgentPubKey; cellId: CellId }>>;
}
