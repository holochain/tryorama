import assert from "assert";
import msgpack from "@msgpack/msgpack";
import uniqueId from "lodash/uniqueId";
import { makeLogger } from "../../src/logger";
import {
  PlayerLogLevel,
  RequestAdminInterfaceData,
  TryCpClient,
} from "../trycp";
import { DEFAULT_PARTIAL_PLAYER_CONFIG } from "../trycp/trycp-server";
import {
  decodeAppApiPayload,
  decodeAppApiResponse,
  decodeTryCpAdminApiResponse,
} from "../trycp/util";
import {
  AgentPubKey,
  CallZomeRequest,
  HoloHash,
  InstalledAppId,
} from "@holochain/client";
import { DnaInstallOptions, ZomeResponsePayload } from "./types";

/**
 * @public
 */
export type PlayerId = string;

/**
 * The function to create a Player, used instead of a static Player factory.
 *
 * @param url - The URL of the TryCP server to connect to.
 * @param id - The Player's name; optional.
 * @returns A configured Player instance.
 *
 * @public
 */
export const createPlayer = async (url: string, id?: PlayerId) => {
  const client = await TryCpClient.create(url);
  const player = new Player(client, id);
  await player.configure();
  return player;
};

/**
 * @internal
 */
class Player {
  private id: string;

  public constructor(private readonly tryCpClient: TryCpClient, id?: PlayerId) {
    this.id = "player-" + (id || uniqueId());
  }

  async reset() {
    return this.tryCpClient.call({
      type: "reset",
    });
  }

  async downloadDna(url: string) {
    const response = await this.tryCpClient.call({
      type: "download_dna",
      url,
    });
    assert(typeof response === "string");
    return response;
  }

  async configure(partialConfig?: string) {
    return this.tryCpClient.call({
      type: "configure_player",
      id: this.id,
      partial_config: partialConfig || DEFAULT_PARTIAL_PLAYER_CONFIG,
    });
  }

  async startup(log_level?: PlayerLogLevel) {
    return this.tryCpClient.call({
      type: "startup",
      id: this.id,
      log_level,
    });
  }

  async shutdown() {
    return this.tryCpClient.call({
      type: "shutdown",
      id: this.id,
    });
  }

  async registerDna(path: string) {
    const response = await this.tryCpClient.call({
      type: "call_admin_interface",
      id: this.id,
      message: msgpack.encode({
        type: "register_dna",
        data: { path },
      }),
    });
    const decodedResponse = decodeTryCpAdminApiResponse(response);
    assert("length" in decodedResponse.data);
    const dnaHash: HoloHash = decodedResponse.data;
    return dnaHash;
  }

  async generateAgentPubKey(): Promise<HoloHash> {
    const response = await this.tryCpClient.call({
      type: "call_admin_interface",
      id: this.id,
      message: msgpack.encode({ type: "generate_agent_pub_key" }),
    });
    const decodedResponse = decodeTryCpAdminApiResponse(response);
    assert("length" in decodedResponse.data);
    const agentPubKey: HoloHash = decodedResponse.data;
    return agentPubKey;
  }

  async installApp(agent_key: AgentPubKey, dnas: DnaInstallOptions[]) {
    const response = await this.tryCpClient.call({
      type: "call_admin_interface",
      id: this.id,
      message: msgpack.encode({
        type: "install_app",
        data: {
          installed_app_id: "entry-app",
          agent_key,
          dnas,
        },
      }),
    });
    const decodedResponse = decodeTryCpAdminApiResponse(response);
    assert("cell_data" in decodedResponse.data);
    const cellId = decodedResponse.data.cell_data[0].cell_id;
    return cellId;
  }

  async enableApp(installed_app_id: InstalledAppId) {
    const response = await this.tryCpClient.call({
      type: "call_admin_interface",
      id: this.id,
      message: msgpack.encode({
        type: "enable_app",
        data: {
          installed_app_id,
        },
      }),
    });
    const decodedResponse = decodeTryCpAdminApiResponse(response);
    assert("app" in decodedResponse.data);
    return decodedResponse.data;
  }

  async attachAppInterface(port: number) {
    const adminRequestData: RequestAdminInterfaceData = {
      type: "attach_app_interface",
      data: { port },
    };
    const response = await this.tryCpClient.call({
      type: "call_admin_interface",
      id: this.id,
      message: msgpack.encode(adminRequestData),
    });
    const decodedResponse = decodeTryCpAdminApiResponse(response);
    assert("port" in decodedResponse.data);
    return decodedResponse.data.port;
  }

  async connectAppInterface(port: number) {
    return this.tryCpClient.call({
      type: "connect_app_interface",
      port,
    });
  }

  /**
   * Make a zome call to the TryCP server.
   */
  async callZome<T extends ZomeResponsePayload>(
    port: number,
    request: CallZomeRequest
  ) {
    request.payload = msgpack.encode(request.payload);
    const response = await this.tryCpClient.call({
      type: "call_app_interface",
      port,
      message: msgpack.encode({
        type: "zome_call",
        data: request,
      }),
    });
    const decodedResponse = decodeAppApiResponse(response);
    if (decodedResponse.type === "error") {
      const errorMessage = `error when calling zome:\n${JSON.stringify(
        decodedResponse.data,
        null,
        4
      )}`;
      throw new Error(errorMessage);
    }
    const decodedPayload = decodeAppApiPayload<T>(decodedResponse.data);
    return decodedPayload;
  }
}
