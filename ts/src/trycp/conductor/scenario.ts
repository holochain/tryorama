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
 * A player tied to a {@link TryCpConductor}.
 *
 * @public
 */
export interface TryCpPlayer extends Player {
  conductor: TryCpConductor;
}

/**
 * An abstraction of a test scenario to write tests against Holochain hApps,
 * running on a TryCp conductor.
 *
 * @public
 */
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

  /**
   * Factory method to create a new scenario.
   *
   * @param serverUrl - The URL of the TryCp server to connect to.
   * @returns A new scenario instance.
   */
  static async create(serverUrl: URL) {
    const scenario = new TryCpScenario(serverUrl);
    scenario.server = await TryCpServer.start();
    return scenario;
  }

  /**
   * Create and add a conductor to the scenario.
   *
   * @param signalHandler - A callback function to handle signals.
   * @returns The newly added conductor instance.
   */
  async addConductor(signalHandler?: AppSignalCb) {
    const conductor = await createTryCpConductor(this.serverUrl, {
      partialConfig,
    });
    await conductor.adminWs().attachAppInterface();
    await conductor.connectAppInterface(signalHandler);
    this.conductors.push(conductor);
    return conductor;
  }

  /**
   * Create and add a single player to the scenario, with a set of DNAs
   * installed.
   *
   * @param dnas - An array of DNAs.
   * @param signalHandler - A callback function to handle signals.
   * @returns A local player instance.
   */
  async addPlayerWithHapp(
    dnas: DnaSource[],
    signalHandler?: AppSignalCb
  ): Promise<TryCpPlayer> {
    const conductor = await this.addConductor(signalHandler);
    const [agentHapp] = await conductor.installAgentsHapps({
      agentsDnas: [dnas],
      uid: this.uid,
      signalHandler,
    });
    return { conductor, ...agentHapp };
  }

  /**
   * Create and add multiple players to the scenario, with a set of DNAs
   * installed for each player.
   *
   * @param playersDnas - An array of DNAs for each player, resulting in a
   * 2-dimensional array.
   * @param signalHandlers - An array of signal handlers for the players
   * (optional).
   * @returns An array with the added players.
   */
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

  /**
   * Create and add a single player to the scenario, with a hApp bundle
   * installed.
   *
   * @param appBundleSource - The bundle or path to the bundle.
   * @param options - {@link HappBundleOptions} plus a signal handler
   * (optional).
   * @returns A local player instance.
   */
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

  /**
   * Create and add multiple players to the scenario, with a hApp bundle
   * installed for each player.
   *
   * @param playersHappBundles - An array with a hApp bundle for each player,
   * and a signal handler (optional).
   * @returns
   */
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

  /**
   * Register all agents of all passed in conductors to each other. This skips
   * peer discovery and thus accelerates test runs.
   *
   * @public
   */
  async addAllAgentsToAllConductors() {
    return addAllAgentsToAllConductors(this.conductors);
  }

  /**
   * Shut down all conductors in the scenario.
   */
  async shutDown() {
    await Promise.all(this.conductors.map((conductor) => conductor.shutDown()));
    await Promise.all(
      this.conductors.map((conductor) => conductor.disconnectClient())
    );
  }

  /**
   * Shut down and delete all conductors in the scenario, and stop the TryCP
   * server.
   *
   * @public
   */
  async cleanUp() {
    await this.shutDown();
    await cleanAllTryCpConductors(this.serverUrl);
    this.conductors = [];
    await this.server?.stop();
  }
}
