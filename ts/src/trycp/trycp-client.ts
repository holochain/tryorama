import msgpack from "@msgpack/msgpack";
import { makeLogger } from "../logger";
import { WebSocket } from "ws";
import {
  TryCpResponseErrorValue,
  TryCpResponseSuccessValue,
  TryCpServerCall,
  TryCpServerRequest,
} from "./types";
import { decodeTryCpResponse } from "./util";

const logger = makeLogger("TryCP client");
let requestId = 0;

export class TryCpClient {
  private readonly ws: WebSocket;
  private requestPromises: {
    [index: string]: {
      responseResolve: (response: TryCpResponseSuccessValue) => void;
      responseReject: (reason: TryCpResponseErrorValue) => void;
    };
  };

  private constructor(url: string) {
    this.ws = new WebSocket(url);
    this.requestPromises = {};
  }

  static async create(url: string) {
    const tryCpClient = new TryCpClient(url);
    const connectPromise = new Promise<TryCpClient>((resolve, reject) => {
      tryCpClient.ws.once("open", () => {
        logger.debug(`connected to TryCP server @ ${url}`);
        tryCpClient.ws.removeEventListener("error", reject);
        resolve(tryCpClient);
      });
      tryCpClient.ws.once("error", (err) => {
        logger.error(`could not connect to TryCP server @ ${url}: ${err}`);
        reject(err);
      });
    });

    tryCpClient.ws.on("message", (encodedResponse: Buffer) => {
      const responseWrapper = decodeTryCpResponse(encodedResponse);
      logger.debug(`response ${JSON.stringify(responseWrapper, null, 4)}`);

      const { responseResolve, responseReject } =
        tryCpClient.requestPromises[responseWrapper.id];
      if (0 in responseWrapper.response) {
        responseResolve(responseWrapper.response[0]);
      } else if (1 in responseWrapper.response) {
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

  async destroy() {
    const closePromise = new Promise((resolve) => {
      this.ws.once("close", (code) => {
        logger.debug(
          `connection to TryCP server @ ${this.ws.url} closed with code ${code}`
        );
        resolve(code);
      });
    });
    this.ws.close(1000);
    return closePromise;
  }

  async ping(data: unknown) {
    const pongPromise = new Promise<Buffer>((resolve) => {
      this.ws.once("pong", (data) => resolve(data));
    });
    this.ws.ping(data);
    return pongPromise;
  }

  call(request: TryCpServerRequest) {
    logger.debug(`request ${JSON.stringify(request, null, 4)}`);

    const callPromise = new Promise<TryCpResponseSuccessValue>(
      (resolve, reject) => {
        this.requestPromises[requestId] = {
          responseResolve: resolve,
          responseReject: reject,
        };
      }
    );

    const serverCall: TryCpServerCall = {
      id: requestId,
      request,
    };
    const encodedServerCall = msgpack.encode(serverCall);
    this.ws.send(encodedServerCall);

    requestId++;
    return callPromise;
  }
}
