import { WebSocket } from "ws";

export class TryCpClient {
  private ws: WebSocket;

  private constructor(url: string) {
    this.ws = new WebSocket(url);
  }

  static async create(url: string) {
    const tryCpClient = new TryCpClient(url);
    const connectPromise = new Promise((resolve, reject) => {
      tryCpClient.ws.on("open", () => {
        console.log("connected to try cp server");
        resolve(null);
      });
      tryCpClient.ws.on("error", (err) => reject(err));
    });
    await connectPromise;
    return tryCpClient;
  }

  async destroy() {
    this.ws.close(1000);
    const closePromise = new Promise((resolve, reject) => {
      this.ws.on("close", (code) => {
        console.log("trycp client ws connection closed with code", code);
        resolve(null);
      });
      this.ws.on("error", (err) => {
        console.error("couldn't close ws connection", err);
        reject(err);
      });
    });
    return closePromise;
  }
}
