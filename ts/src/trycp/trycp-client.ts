import { AppSignalCb } from "@holochain/client";
import msgpack from "@msgpack/msgpack";
import cloneDeep from "lodash/cloneDeep.js";
import { URL } from "node:url";
import { WebSocket } from "ws";
import { makeLogger } from "../logger.js";
import {
  cleanAllTryCpConductors,
  TryCpConductor,
} from "./conductor/conductor.js";
import {
  TryCpApiResponse,
  TryCpRequest,
  TryCpResponseErrorValue,
  TryCpSuccessResponse,
  TRYCP_SUCCESS_RESPONSE,
  _TryCpCall,
  _TryCpSuccessResponseSeralized,
} from "./types.js";
import {
  deserializeApiResponse,
  deserializeTryCpResponse,
  deserializeTryCpSignal,
} from "./util.js";

const logger = makeLogger("TryCP client");
let requestId = 0;

const partialConfig = `signing_service_uri: ~
encryption_service_uri: ~
decryption_service_uri: ~
dpki: ~
network:
  transport_pool:
    - type: quic
  network_type: quic_mdns`;

/**
 * A factory class to create client connections to a running TryCP server.
 *
 * @public
 */
export class TryCpClient {
  private readonly ws: WebSocket;
  private requestPromises: {
    [index: string]: {
      responseResolve: (response: TryCpSuccessResponse) => void;
      responseReject: (reason: TryCpResponseErrorValue) => void;
    };
  };
  private signalHandlers: Record<number, AppSignalCb | undefined>;

  conductors: TryCpConductor[];

  private constructor(serverUrl: URL, timeout = 15000) {
    this.ws = new WebSocket(serverUrl, { timeout });
    this.requestPromises = {};
    this.signalHandlers = {};
    this.conductors = [];
  }

  /**
   * Create a client connection to a running TryCP server.
   *
   * @param serverUrl - The URL of the TryCP server.
   * @returns A client connection.
   */
  static async create(serverUrl: URL, timeout?: number) {
    const tryCpClient = new TryCpClient(serverUrl, timeout);
    const connectPromise = new Promise<TryCpClient>((resolve, reject) => {
      tryCpClient.ws.once("open", () => {
        logger.verbose(`connected to TryCP server @ ${serverUrl}`);
        tryCpClient.ws.removeEventListener("error", reject);
        resolve(tryCpClient);
      });
      tryCpClient.ws.once("error", (err) => {
        logger.error(
          `could not connect to TryCP server @ ${serverUrl.href}: ${err}`
        );
        reject(err);
      });
    });

    tryCpClient.ws.on("message", (encodedResponse: Buffer) => {
      try {
        const responseWrapper = deserializeTryCpResponse(encodedResponse);

        if (responseWrapper.type === "signal") {
          const signalHandler =
            tryCpClient.signalHandlers[responseWrapper.port];
          if (signalHandler) {
            const signal = deserializeTryCpSignal(responseWrapper.data);
            logger.debug(
              `received signal @ port ${responseWrapper.port}: ${JSON.stringify(
                signal,
                null,
                4
              )}\n`
            );
            signalHandler(signal);
          } else {
            logger.info(
              "received signal from TryCP server, but no signal handler registered"
            );
          }
        } else if (responseWrapper.type === "response") {
          const { responseResolve, responseReject } =
            tryCpClient.requestPromises[responseWrapper.id];

          // the server responds with an object
          // it contains `0` as property for formally correct requests
          // and `1` when the format was incorrect
          if ("0" in responseWrapper.response) {
            try {
              const innerResponse = tryCpClient.processSuccessResponse(
                responseWrapper.response[0]
              );
              responseResolve(innerResponse);
            } catch (error) {
              if (error instanceof Error) {
                responseReject(error);
              } else {
                const errorMessage = JSON.stringify(error, null, 4);
                responseReject(errorMessage);
              }
            }
          } else if ("1" in responseWrapper.response) {
            responseReject(responseWrapper.response[1]);
          } else {
            logger.error(
              "unknown response type",
              JSON.stringify(responseWrapper.response, null, 4)
            );
            throw new Error("Unknown response type");
          }
          delete tryCpClient.requestPromises[responseWrapper.id];
        }
      } catch (error) {
        console.error("eeafdf", error);
      }
    });
    tryCpClient.ws.on("error", (err) => {
      logger.error(err);
    });

    return connectPromise;
  }

  setSignalHandler(port: number, signalHandler?: AppSignalCb) {
    this.signalHandlers[port] = signalHandler;
  }

  /**
   * Closes the client connection.
   *
   * @returns A promise that resolves when the connection was closed.
   */
  async close() {
    const closePromise = new Promise((resolve) => {
      this.ws.once("close", (code) => {
        logger.verbose(
          `connection to TryCP server @ ${this.ws.url} closed with code ${code}`
        );
        resolve(code);
      });
    });
    this.ws.close(1000);
    return closePromise;
  }

  /**
   * Send a ping with data.
   *
   * @param data - Data to send and receive with the ping-pong.
   * @returns A promise that resolves when the pong was received.
   */
  async ping(data: unknown) {
    const pongPromise = new Promise<Buffer>((resolve) => {
      this.ws.once("pong", (data) => resolve(data));
    });
    this.ws.ping(data);
    return pongPromise;
  }

  /**
   * Send a call to the TryCP server.
   *
   * @param request - {@link TryCpRequest}
   * @returns A promise that resolves to the {@link TryCpSuccessResponse}
   */
  call(request: TryCpRequest) {
    const requestDebugLog = this.getFormattedRequestLog(request);
    logger.debug(`request ${requestDebugLog}\n`);

    const callPromise = new Promise<TryCpSuccessResponse>((resolve, reject) => {
      this.requestPromises[requestId] = {
        responseResolve: resolve,
        responseReject: reject,
      };
    });

    const serverCall: _TryCpCall = {
      id: requestId,
      request,
    };

    // serialize payload if the request is a zome call
    if (
      serverCall.request.type === "call_app_interface" &&
      "data" in serverCall.request.message &&
      serverCall.request.message.type === "zome_call"
    ) {
      serverCall.request.message.data.payload = msgpack.encode(
        serverCall.request.message.data.payload
      );
    }

    // serialize message if the request is an Admin or App API call
    if (
      serverCall.request.type === "call_admin_interface" ||
      serverCall.request.type === "call_app_interface"
    ) {
      serverCall.request.message = msgpack.encode(serverCall.request.message);
    }

    // serialize entire request
    const serializedRequest = msgpack.encode(serverCall);
    this.ws.send(serializedRequest);

    requestId++;
    return callPromise;
  }

  /**
   * Create and add a conductor to the client.
   *
   * @param signalHandler - A callback function to handle signals.
   * @returns The newly added conductor instance.
   */
  async addConductor(signalHandler?: AppSignalCb) {
    const conductor = new TryCpConductor(this);
    await conductor.configure(partialConfig);
    await conductor.startUp();
    await conductor.adminWs().attachAppInterface();
    await conductor.connectAppInterface(signalHandler);
    this.conductors.push(conductor);
    return conductor;
  }

  async shutDownConductors() {
    await Promise.all(this.conductors.map((conductor) => conductor.shutDown()));
  }

  async cleanUp() {
    await this.shutDownConductors();
    await cleanAllTryCpConductors(this);
    await this.close();
  }

  private processSuccessResponse(response: _TryCpSuccessResponseSeralized) {
    if (response === TRYCP_SUCCESS_RESPONSE || typeof response === "string") {
      logger.debug(`response ${JSON.stringify(response, null, 4)}\n`);
      return response;
    }

    const deserializedApiResponse = deserializeApiResponse(response);

    // when the request fails, the response's type is "error"
    if (deserializedApiResponse.type === "error") {
      const errorMessage = `error response from Admin API\n${JSON.stringify(
        deserializedApiResponse.data,
        null,
        4
      )}`;
      throw new Error(errorMessage);
    }

    logger.debug(this.getFormattedResponseLog(deserializedApiResponse));

    return deserializedApiResponse;
  }

  private getFormattedResponseLog(response: TryCpApiResponse) {
    let debugLog;
    if (
      "data" in response &&
      response.data &&
      typeof response.data !== "string" &&
      "BYTES_PER_ELEMENT" in response.data &&
      response.data.length === 39
    ) {
      // Holochain hash
      const hashB64 = Buffer.from(response.data).toString("base64");
      const deserializedResponseForLog = Object.assign(
        {},
        { ...response },
        { data: hashB64 }
      );
      debugLog = `response ${JSON.stringify(
        deserializedResponseForLog,
        null,
        4
      )}\n`;
    } else {
      debugLog = `response ${JSON.stringify(response, null, 4)}\n`;
    }
    return debugLog;
  }

  private getFormattedRequestLog(request: TryCpRequest) {
    let debugLog = cloneDeep(request);
    if (
      debugLog.type === "call_app_interface" &&
      "data" in debugLog.message &&
      debugLog.message.type === "zome_call"
    ) {
      debugLog.message.data = Object.assign(debugLog.message.data, {
        cell_id: [
          Buffer.from(debugLog.message.data.cell_id[0]).toString("base64"),
          Buffer.from(debugLog.message.data.cell_id[1]).toString("base64"),
        ],
        provenance: Buffer.from(debugLog.message.data.provenance).toString(
          "base64"
        ),
      });
    }
    if ("content" in request) {
      // Call "save_dna" submits a DNA as binary
      debugLog = Object.assign(debugLog, { content: undefined });
    }
    return JSON.stringify(debugLog, null, 4);
  }
}
