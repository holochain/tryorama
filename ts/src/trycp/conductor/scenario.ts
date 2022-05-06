import { v4 as uuidv4 } from "uuid";
import { AppSignalCb, DnaSource } from "@holochain/client";
import { TryCpServer } from "../trycp-server";
import {
  cleanAllTryCpConductors,
  createTryCpConductor,
  TryCpConductor,
} from "./conductor";
import { URL } from "url";
import { addAllAgentsToAllConductors } from "../../util";
import { Player } from "../../types";

const partialConfig = `signing_service_uri: ~
encryption_service_uri: ~
decryption_service_uri: ~
dpki: ~
network:
  transport_pool:
    - type: quic
  network_type: quic_mdns`;

/**
 * @public
 */
export interface TryCpPlayer extends Player {
  conductor: TryCpConductor;
}

export class TryCpScenario {
  uid: string;
  conductors: TryCpConductor[];
  private serverUrl: URL;
  private server: TryCpServer | undefined;

  private constructor(serverUrl: URL) {
    this.uid = uuidv4();
    this.conductors = [];
    this.serverUrl = serverUrl;
    this.server = undefined;
  }

  static async create(serverUrl: URL) {
    const scenario = new TryCpScenario(serverUrl);
    scenario.server = await TryCpServer.start();
    return scenario;
  }

  async addPlayer(
    dnas: DnaSource[],
    signalHandler?: AppSignalCb
  ): Promise<TryCpPlayer> {
    const conductor = await createTryCpConductor(this.serverUrl, {
      partialConfig,
    });
    const [agentCells] = await conductor.installAgentsHapps({
      agentsDnas: [dnas],
      uid: this.uid,
      signalHandler,
    });
    this.conductors.push(conductor);
    return { conductor, ...agentCells };
  }

  async addPlayers(
    playersDnas: DnaSource[][],
    signalHandlers?: Array<AppSignalCb | undefined>
  ): Promise<TryCpPlayer[]> {
    const players = await Promise.all(
      playersDnas.map((playerDnas, i) =>
        this.addPlayer(playerDnas, signalHandlers?.[i])
      )
    );
    return players;
  }

  async addAllAgentsToAllConductors() {
    return addAllAgentsToAllConductors(this.conductors);
  }

  async cleanUp(): Promise<void> {
    await Promise.all(this.conductors.map((conductor) => conductor.shutDown()));
    await Promise.all(
      this.conductors.map((conductor) => conductor.disconnectClient())
    );
    await cleanAllTryCpConductors(this.serverUrl);
    this.conductors = [];
    await this.server?.stop();
  }
}
