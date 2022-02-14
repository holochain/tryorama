import { WebSocket } from "ws";

let clientId = 1;

export class TryCpClient {
  private ws: WebSocket;

  private constructor(url: string) {
    this.ws = new WebSocket(url);
  }

  static async create(url: string) {
    const tryCpClient = new TryCpClient(url);
    const connectPromise = new Promise<TryCpClient>((resolve, reject) => {
      tryCpClient.ws.once("open", () => {
        console.log(`TryCP client ${clientId}: connected to TryCP server`);
        clientId++;
        resolve(tryCpClient);
      });
      tryCpClient.ws.on(`TryCP client ${clientId}: error`, (err) =>
        reject(err)
      );
    });
    return connectPromise;
  }

  async destroy() {
    this.ws.close(1000);
    const closePromise = new Promise((resolve) => {
      this.ws.once("close", (code) => {
        console.log(
          `TryCP client ${clientId}: ws connection closed with code ${code}`
        );
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
}
