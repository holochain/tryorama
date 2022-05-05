import { v4 as uuidv4 } from "uuid";
import { DnaSource } from "@holochain/client";
import { TryCpServer } from "../trycp-server";
import {
  cleanAllConductors,
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

  async addPlayer(dnas: DnaSource[]): Promise<TryCpPlayer> {
    const conductor = await createTryCpConductor(this.serverUrl, {
      partialConfig,
    });
    const [agentCells] = await conductor.installAgentsHapps({
      agentsDnas: [dnas],
      uid: this.uid,
    });
    this.conductors.push(conductor);
    return { conductor, ...agentCells };
  }

  async addPlayers(playersDnas: DnaSource[][]): Promise<TryCpPlayer[]> {
    const players: TryCpPlayer[] = [];
    await Promise.all(
      playersDnas.map(async (playerDnas) => {
        const player = await this.addPlayer(playerDnas);
        players.push(player);
      })
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
    await cleanAllConductors(this.serverUrl);
    this.conductors = [];
    await this.server?.stop();
  }
}
