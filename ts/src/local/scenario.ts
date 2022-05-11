import { v4 as uuidv4 } from "uuid";
import { AppBundleSource, AppSignalCb, DnaSource } from "@holochain/client";
import {
  cleanAllConductors,
  createLocalConductor,
  LocalConductor,
} from "./conductor";
import { HappBundleOptions, Player, Scenario } from "../types";

/**
 * A player with a {@link LocalConductor} property.
 *
 * @public
 */
export interface LocalPlayer extends Player {
  conductor: LocalConductor;
}

/**
 * An abstraction of a test scenario to write tests against Holochain hApps.
 *
 * @public
 */
export class LocalScenario implements Scenario {
  private timeout: number | undefined;
  uid: string;
  conductors: LocalConductor[];

  /**
   * LocalScenario constructor.
   *
   * @param options - Timeout for requests to Admin and App API calls.
   */
  constructor(options?: { timeout?: number }) {
    this.timeout = options?.timeout;
    this.uid = uuidv4();
    this.conductors = [];
  }

  /**
   * Create and add a conductor to the scenario.
   *
   * @param signalHandler - A callback function to handle signals.
   * @returns The newly added conductor instance.
   */
  async addConductor(signalHandler?: AppSignalCb) {
    const conductor = await createLocalConductor({ timeout: this.timeout });
    await conductor.attachAppInterface();
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
  ): Promise<LocalPlayer> {
    const conductor = await this.addConductor(signalHandler);
    const [agentHapp] = await conductor.installAgentsHapps({
      agentsDnas: [dnas],
      uid: this.uid,
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
  ): Promise<LocalPlayer[]> {
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
   * @param options - Options for the hApp bundle plus a signal handler
   * (optional).
   * @returns A local player instance.
   */
  async addPlayerWithHappBundle(
    appBundleSource: AppBundleSource,
    options?: HappBundleOptions & { signalHandler?: AppSignalCb }
  ): Promise<LocalPlayer> {
    const conductor = await this.addConductor(options?.signalHandler);
    options = options
      ? Object.assign(options, { uid: options.uid ?? this.uid })
      : { uid: this.uid };
    const agentHapp = await conductor.installHappBundle(
      appBundleSource,
      options
    );
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
      playersHappBundles.map((playerHappBundle) =>
        this.addPlayerWithHappBundle(
          playerHappBundle.appBundleSource,
          playerHappBundle.options
        )
      )
    );
    return players;
  }

  /**
   * Shut down all conductors in the scenario.
   */
  async shutDown() {
    await Promise.all(this.conductors.map((conductor) => conductor.shutDown()));
  }

  /**
   * Shut down and delete all conductors in the scenario.
   */
  async cleanUp() {
    await this.shutDown();
    await cleanAllConductors();
    this.conductors = [];
  }
}
