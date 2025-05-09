import { AppBundleSource, AppWebsocket } from "@holochain/client";
import assert from "node:assert";
import { ChildProcessWithoutNullStreams } from "node:child_process";
import { v4 as uuidv4 } from "uuid";
import {
  addAllAgentsToAllConductors,
  enableAndGetAgentApp,
  runLocalServices,
  stopLocalServices,
} from "./conductor-helpers.js";
import { cleanAllConductors, Conductor, createConductor } from "./conductor.js";
import { AgentApp, AppOptions } from "./types.js";

/**
 * A player tied to a {@link Conductor}.
 *
 * @public
 */
export interface Player extends AgentApp {
  appWs: AppWebsocket;
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

  // Disable local bootstrap and signal server.
  //
  // This will prevent peers from reaching each other.
  //
  // Default: false
  disableLocalServices?: boolean;
}

/**
 * An abstraction of a test scenario to write tests against Holochain hApps,
 * running on a local conductor.
 *
 * @public
 */
export class Scenario {
  private timeout: number | undefined;
  noDpki: boolean;
  dpkiNetworkSeed: string;
  networkSeed: string;
  disableLocalServices: boolean | undefined;
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
    this.noDpki = false;
    this.dpkiNetworkSeed = uuidv4();
    this.networkSeed = uuidv4();
    this.disableLocalServices = options?.disableLocalServices ?? false;
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
    options?: AppOptions,
  ): Promise<Player> {
    await this.ensureLocalServices();
    const conductor = await this.addConductor();
    if (options?.networkConfig) {
      conductor.setNetworkConfig(options.networkConfig);
    }
    options = {
      ...options,
      networkSeed: options?.networkSeed ?? this.networkSeed,
    };
    const appInfo = await conductor.installApp(appBundleSource, options);
    const adminWs = conductor.adminWs();
    const port = await conductor.attachAppInterface();
    const issued = await adminWs.issueAppAuthenticationToken({
      installed_app_id: appInfo.installed_app_id,
    });
    const appWs = await conductor.connectAppWs(issued.token, port);
    const agentApp: AgentApp = await enableAndGetAgentApp(
      adminWs,
      appWs,
      appInfo,
    );
    return { conductor, appWs, ...agentApp };
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
    }>,
  ) {
    await this.ensureLocalServices();
    return await Promise.all(
      playersApps.map((playerApp) =>
        this.addPlayerWithApp(playerApp.appBundleSource, playerApp.options),
      ),
    );
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
    if (this.disableLocalServices) {
      this.bootstrapServerUrl = new URL("https://BAD_URL");
      this.signalingServerUrl = new URL("wss://BAD_URL");
    }

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
  options?: ScenarioOptions,
) => {
  const scenario = new Scenario(options);
  try {
    await testScenario(scenario);
  } catch (error) {
    console.error("error occurred during test run:", error);
    throw error;
  } finally {
    if (cleanUp) {
      await scenario.cleanUp();
    } else {
      await scenario.shutDown();
    }
  }
};
