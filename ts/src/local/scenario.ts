import { AppBundleSource, CellId } from "@holochain/client";
import { v4 as uuidv4 } from "uuid";
import {
  addAllAgentsToAllConductors,
  stopLocalServices,
  runLocalServices,
} from "../common.js";
import { AppOptions, IPlayer } from "../types.js";
import { cleanAllConductors, Conductor, createConductor } from "./conductor.js";
import { awaitDhtSync } from "../util.js";
import { ChildProcessWithoutNullStreams } from "node:child_process";
import assert from "node:assert";

/**
 * A player tied to a {@link Conductor}.
 *
 * @public
 */
export interface Player extends IPlayer {
  conductor: Conductor;
}

/**
 * Options when creating a scenario.
 *
 * @public
 */
export interface ScenarioOptions {
  // Timeout for requests to Admin and App API calls.
  timeout?: number;
}

/**
 * An abstraction of a test scenario to write tests against Holochain hApps,
 * running on a local conductor.
 *
 * @public
 */
export class Scenario {
  private timeout: number | undefined;
  networkSeed: string;
  serviceProcess: ChildProcessWithoutNullStreams | undefined;
  bootstrapServerUrl: URL | undefined;
  signalingServerUrl: URL | undefined;
  conductors: Conductor[];

  /**
   * Scenario constructor.
   *
   * @param options - Timeout for requests to Admin and App API calls.
   */
  constructor(options?: ScenarioOptions) {
    this.timeout = options?.timeout;
    this.networkSeed = uuidv4();
    this.serviceProcess = undefined;
    this.bootstrapServerUrl = undefined;
    this.signalingServerUrl = undefined;
    this.conductors = [];
  }

  /**
   * Create and add a conductor to the scenario.
   *
   * @returns The newly added conductor instance.
   */
  async addConductor() {
    await this.ensureLocalServices();
    assert(this.serviceProcess);
    assert(this.signalingServerUrl);
    const conductor = await createConductor(this.signalingServerUrl, {
      timeout: this.timeout,
      attachAppInterface: false,
      bootstrapServerUrl: this.bootstrapServerUrl,
    });
    this.conductors.push(conductor);
    return conductor;
  }

  /**
   * Create and add a single player with an app installed to the scenario.
   *
   * @param appBundleSource - The bundle or path to the bundle.
   * @param options - {@link AppOptions}.
   * @returns A local player instance.
   */
  async addPlayerWithApp(
    appBundleSource: AppBundleSource,
    options?: AppOptions
  ): Promise<Player> {
    await this.ensureLocalServices();
    const conductor = await this.addConductor();
    options = {
      ...options,
      networkSeed: options?.networkSeed ?? this.networkSeed,
    };
    const agentApp = await conductor.installApp(appBundleSource, options);
    await conductor.attachAppInterface();
    await conductor.connectAppAgentInterface(agentApp.appId);
    return { conductor, ...agentApp };
  }

  /**
   * Create and add multiple players to the scenario, with an app installed
   * for each player.
   *
   * @param playersApps - An array with an app for each player.
   * @returns All created players.
   */
  async addPlayersWithApps(
    playersApps: Array<{
      appBundleSource: AppBundleSource;
      options?: AppOptions;
    }>
  ) {
    await this.ensureLocalServices();
    const players = await Promise.all(
      playersApps.map((playerApp) =>
        this.addPlayerWithApp(playerApp.appBundleSource, playerApp.options)
      )
    );
    return players;
  }

  /**
   * Register all agents of all passed in conductors to each other. This skips
   * peer discovery through gossip and thus accelerates test runs.
   *
   * @public
   */
  async shareAllAgents() {
    return addAllAgentsToAllConductors(this.conductors);
  }

  /**
   * Await DhtOp integration of all players for a given cell.
   *
   * @param cellId - Cell id to await DHT sync for.
   * @param interval - Interval to pause between comparisons (defaults to 50 ms).
   * @param timeout - A timeout for the delay (optional).
   * @returns A promise that is resolved when the DHTs of all conductors are
   * synced.
   */
  async awaitDhtSync(cellId: CellId, interval?: number, timeout?: number) {
    return awaitDhtSync(this.conductors, cellId, interval, timeout);
  }

  /**
   * Shut down all conductors in the scenario.
   */
  async shutDown() {
    await Promise.all(this.conductors.map((conductor) => conductor.shutDown()));
    if (this.serviceProcess) {
      await stopLocalServices(this.serviceProcess);
    }
  }

  /**
   * Shut down and delete all conductors in the scenario.
   */
  async cleanUp() {
    await this.shutDown();
    await cleanAllConductors();
    this.conductors = [];
    this.serviceProcess = undefined;
    this.bootstrapServerUrl = undefined;
    this.signalingServerUrl = undefined;
  }

  private async ensureLocalServices() {
    if (!this.serviceProcess) {
      ({
        servicesProcess: this.serviceProcess,
        bootstrapServerUrl: this.bootstrapServerUrl,
        signalingServerUrl: this.signalingServerUrl,
      } = await runLocalServices());
    }
  }
}

/**
 * A wrapper function to create and run a scenario. A scenario is created
 * and all involved conductors are shut down and cleaned up after running.
 *
 * @param testScenario - The test to be run.
 * @param cleanUp - Whether to delete conductors after running. @defaultValue true
 *
 * @public
 */
export const runScenario = async (
  testScenario: (scenario: Scenario) => Promise<void>,
  cleanUp = true,
  options?: ScenarioOptions
) => {
  const scenario = new Scenario(options);
  try {
    await testScenario(scenario);
  } finally {
    if (cleanUp) {
      await scenario.cleanUp();
    } else {
      await scenario.shutDown();
    }
  }
};
