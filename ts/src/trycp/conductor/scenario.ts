import { v4 as uuidv4 } from "uuid";
import { AppBundleSource, AppSignalCb, DnaSource } from "@holochain/client";
import { TryCpServer } from "../trycp-server";
import {
  cleanAllTryCpConductors,
  createTryCpConductor,
  TryCpConductor,
} from "./conductor";
import { URL } from "url";
import { addAllAgentsToAllConductors } from "../../common";
import { HappBundleOptions, Player, Scenario } from "../../types";

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

export class TryCpScenario implements Scenario {
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

  async addConductor(signalHandler?: AppSignalCb) {
    const conductor = await createTryCpConductor(this.serverUrl, {
      partialConfig,
    });
    await conductor.adminWs().attachAppInterface();
    await conductor.connectAppInterface(signalHandler);
    this.conductors.push(conductor);
    return conductor;
  }

  async addPlayerWithHapp(
    dnas: DnaSource[],
    signalHandler?: AppSignalCb
  ): Promise<TryCpPlayer> {
    const conductor = await this.addConductor(signalHandler);
    const [agentCells] = await conductor.installAgentsHapps({
      agentsDnas: [dnas],
      uid: this.uid,
      signalHandler,
    });
    return { conductor, ...agentCells };
  }

  async addPlayersWithHapps(
    playersDnas: DnaSource[][],
    signalHandlers?: Array<AppSignalCb | undefined>
  ): Promise<TryCpPlayer[]> {
    const players = await Promise.all(
      playersDnas.map((playerDnas, i) =>
        this.addPlayerWithHapp(playerDnas, signalHandlers?.[i])
      )
    );
    return players;
  }

  async addPlayerWithHappBundle(
    appBundleSource: AppBundleSource,
    options?: HappBundleOptions & { signalHandler?: AppSignalCb }
  ) {
    const conductor = await this.addConductor(options?.signalHandler);
    options = options
      ? Object.assign(options, { uid: options.uid ?? this.uid })
      : { uid: this.uid };
    const agentHapp = await conductor.installHappBundle(
      appBundleSource,
      options
    );
    this.conductors.push(conductor);
    return { conductor, ...agentHapp };
  }

  async addPlayersWithHappBundles(
    playersHappBundles: Array<{
      appBundleSource: AppBundleSource;
      options?: HappBundleOptions & { signalHandler?: AppSignalCb };
    }>
  ) {
    const players = await Promise.all(
      playersHappBundles.map(async (playerHappBundle) =>
        this.addPlayerWithHappBundle(
          playerHappBundle.appBundleSource,
          playerHappBundle.options
        )
      )
    );
    return players;
  }

  async addAllAgentsToAllConductors() {
    return addAllAgentsToAllConductors(this.conductors);
  }

  async shutDown() {
    await Promise.all(this.conductors.map((conductor) => conductor.shutDown()));
    await Promise.all(
      this.conductors.map((conductor) => conductor.disconnectClient())
    );
  }

  async cleanUp() {
    await this.shutDown();
    await cleanAllTryCpConductors(this.serverUrl);
    this.conductors = [];
    await this.server?.stop();
  }
}
