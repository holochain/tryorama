import msgpack from "@msgpack/msgpack";
import { makeLogger } from "../logger";
import { WebSocket } from "ws";
import { TryCpCallPayload, TryCpResponseWrapper } from "./types";
import { decodeTryCpResponse } from "./util";

const logger = makeLogger("TryCP client", true);

const DEFAULT_PARTIAL_PLAYER_CONFIG = `signing_service_uri: ~
  encryption_service_uri: ~
  decryption_service_uri: ~
  dpki: ~
  network: ~` as const;

export class TryCpClient {
  private readonly ws: WebSocket;

  private constructor(url: string) {
    this.ws = new WebSocket(url);
  }

  static async create(url: string) {
    const tryCpClient = new TryCpClient(url);
    const connectPromise = new Promise<TryCpClient>((resolve, reject) => {
      tryCpClient.ws.once("open", () => {
        logger.info(`connected to TryCP server @ ${url}`);
        tryCpClient.ws.removeEventListener("error", reject);
        resolve(tryCpClient);
      });
      tryCpClient.ws.once("error", (err) => {
        logger.error(`could not connect to TryCP server @ ${url}: ${err}`);
        reject(err);
      });
    });
    return connectPromise;
  }

  async destroy() {
    this.ws.close(1000);
    const closePromise = new Promise((resolve, reject) => {
      this.ws.once("close", (code) => {
        logger.info(
          `connection to TryCP server @ ${this.ws.url} closed with code ${code}`
        );
        resolve(code);
      });
      this.ws.once("error", (err) => {
        logger.error(
          `error on closing connection to TryCP server @ ${this.ws.url}: ${err}`
        );
        reject(err);
      });
    });
    return closePromise;
  }

  async ping(data: unknown) {
    const pongPromise = new Promise<Buffer>((resolve, reject) => {
      this.ws.once("pong", (data) => resolve(data));
      this.ws.once("error", (err) => {
        logger.error(`ping to TryCP server failed with error ${err}`);
        reject(err);
      });
    });
    this.ws.ping(data);
    return pongPromise;
  }

  async call(payload: TryCpCallPayload) {
    // const encodedPayload = msgpack.encode(payload);
    const callPromise = new Promise<TryCpResponseWrapper>((resolve) => {
      this.ws.once("message", (encodedResponse: Buffer) => {
        const response = decodeTryCpResponse(encodedResponse);
        logger.info(`response ${response}`);
        resolve(response);
      });
    });
    this.ws.send(
      msgpack.encode({
        id: 1,
        request: {
          type: "configure_player",
          id: "my-player",
          partial_config: DEFAULT_PARTIAL_PLAYER_CONFIG,
        },
      })
      // msgpack.encode({ id: 1, request: { type: "startup", id: "my-player" } })

      // msgpack.encode({
      //   type: "call_admin_interface",
      //   id: "my-player",
      //   message: msgpack.encode({ type: "generate_agent_pub_key" }),
      // })
    );
    return callPromise;
  }
}
