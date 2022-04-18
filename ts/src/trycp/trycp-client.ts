import msgpack from "@msgpack/msgpack";
import cloneDeep from "lodash/cloneDeep";
import { makeLogger } from "../logger";
import { WebSocket } from "ws";
import {
  TryCpResponseErrorValue,
  _TryCpSuccessResponseSeralized,
  _TryCpCall,
  TryCpRequest,
  TRYCP_SUCCESS_RESPONSE,
  TryCpSuccessResponse,
  _TryCpApiResponse,
} from "./types";
import { deserializeTryCpResponse, deserializeApiResponse } from "./util";

const logger = makeLogger("TryCP client");
let requestId = 0;

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

  private constructor(url: string) {
    this.ws = new WebSocket(url);
    this.requestPromises = {};
  }

  /**
   * Create a client connection to a running TryCP server.
   *
   * @param url - The URL of the TryCP server.
   * @returns A client connection.
   */
  static async create(url: string) {
    const tryCpClient = new TryCpClient(url);
    const connectPromise = new Promise<TryCpClient>((resolve, reject) => {
      tryCpClient.ws.once("open", () => {
        logger.verbose(`connected to TryCP server @ ${url}`);
        tryCpClient.ws.removeEventListener("error", reject);
        resolve(tryCpClient);
      });
      tryCpClient.ws.once("error", (err) => {
        logger.error(`could not connect to TryCP server @ ${url}: ${err}`);
        reject(err);
      });
    });

    tryCpClient.ws.on("message", (encodedResponse: Buffer) => {
      const responseWrapper = deserializeTryCpResponse(encodedResponse);
      const { responseResolve, responseReject } =
        tryCpClient.requestPromises[responseWrapper.id];

      // the server responds with an object
      // for formally correct requests it contains `0` as property and otherwise `1` when the format was incorrect
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
      }
      delete tryCpClient.requestPromises[responseWrapper.id];
    });
    tryCpClient.ws.on("error", (err) => {
      logger.error(err);
    });

    return connectPromise;
  }

  processSuccessResponse(response: _TryCpSuccessResponseSeralized) {
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
   * @returns A promise that resolves to the {@link TryCpResponseSuccessValue}
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

  private getFormattedResponseLog(response: _TryCpApiResponse) {
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
