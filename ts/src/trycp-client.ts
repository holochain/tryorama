import { WebSocket } from "ws";
import msgpack from "@msgpack/msgpack";

export interface TryCpCallPayload {
  type: string;
  id: string;
  message: { type: string };
}

export class TryCpClient {
  private ws: WebSocket;

  private constructor(url: string) {
    this.ws = new WebSocket(url);
  }

  static async create(url: string) {
    const tryCpClient = new TryCpClient(url);
    const connectPromise = new Promise<TryCpClient>((resolve, reject) => {
      tryCpClient.ws.once("open", () => {
        console.log("TryCP client: connected to TryCP server");
        resolve(tryCpClient);
      });
      tryCpClient.ws.on("TryCP client: error", (err) => reject(err));
    });
    return connectPromise;
  }

  async destroy() {
    this.ws.close(1000);
    const closePromise = new Promise((resolve) => {
      this.ws.once("close", (code) => {
        console.log(`TryCP client: ws connection closed with code ${code}`);
        resolve(code);
      });
    });
    return closePromise;
  }

  async ping(data: unknown) {
    const pongPromise = new Promise<Buffer>((resolve) =>
      this.ws.once("pong", (data) => resolve(data))
    );
    this.ws.ping(data);
    return pongPromise;
  }

  async call<T>(payload: TryCpCallPayload): Promise<T> {
    // const encodedPayload = msgpack.encode(payload);
    const callPromise = new Promise<T>((resolve) => {
      this.ws.once("message", (data) => {
        console.log("recieved some data here", data);
        // @ts-ignore
        resolve(data);
      });
    });
    this.ws.send("setsdfs", (err) => {
      if (err) {
        console.error("ererererererer", err);
      }
    });
    return callPromise;
  }
}
