import {
  AgentPubKey,
  AppBundleSource,
  AppSignalCb,
  CellId,
} from "@holochain/client";
import { ChildProcessWithoutNullStreams } from "node:child_process";
import { URL } from "url";
import { v4 as uuidv4 } from "uuid";
import {
  addAllAgentsToAllConductors as shareAllAgents,
  stopLocalServices,
} from "../../common.js";
import { AppOptions, IPlayer } from "../../types.js";
import { awaitDhtSync } from "../../util.js";
import { TryCpClient } from "../trycp-client.js";
import { TryCpConductor } from "./conductor.js";

/**
 * @public
 */
export interface ClientsPlayersOptions {
  /**
   * A timeout for the web socket connection (optional).
   */
  clientTimeout?: number;

  /**
   * An app that will be installed for each agent (optional).
   */
  app?: AppBundleSource;

  /**
   * A list of previously generated agent pub keys (optional).
   */
  agentPubKeys?: AgentPubKey[];

  /**
   * Number of conductors per client. Default to 1.
   */
  numberOfConductorsPerClient?: number;

  /**
   * Number of agents per conductor. Requires `app` to be specified.
   */
  numberOfAgentsPerConductor?: number;

  /**
   * Configuration for the conductor (optional).
   */
  partialConfig?: string;

  /**
   * A signal handler to be registered in conductors.
   */
  signalHandler?: AppSignalCb;
}

/**
 * A player tied to a {@link TryCpConductor}.
 *
 * @public
 */
export interface TryCpPlayer extends IPlayer {
  conductor: TryCpConductor;
}

/**
 * A test scenario abstraction with convenience functions to manage TryCP
 * clients and players (agent + conductor).
 *
 * Clients in turn help manage conductors on TryCP servers. Clients can be
 * added to a scenario to keep track of all server connections. When finishing
 * a test scenario, all conductors of all clients can be easily cleaned up and
 * the client connections closed.
 *
 * @public
 */
export class TryCpScenario {
  network_seed: string;
  servicesProcess: ChildProcessWithoutNullStreams | undefined;
  bootstrapServerUrl: URL | undefined;
  signalingServerUrl: URL | undefined;
  clients: TryCpClient[];

  constructor() {
    this.network_seed = uuidv4();
    this.clients = [];
  }

  /**
   * Creates a TryCP client connection and add it to the scenario.
   *
   * @param serverUrl - The TryCP server URL to connect to.
   * @param timeout - An optional timeout for the web socket connection.
   * @returns The created TryCP client.
   */
  async addClient(serverUrl: URL, timeout?: number) {
    const client = await TryCpClient.create(serverUrl, timeout);
    client.bootstrapServerUrl = this.bootstrapServerUrl;
    client.signalingServerUrl = this.signalingServerUrl;
    this.clients.push(client);
    return client;
  }

  /**
   * Creates client connections for all passed in URLs and, depending on the
   * options, creates multiple players with apps. Adds all clients to the
   * scenario.
   *
   * @param serverUrls - The TryCP server URLs to connect to.
   * @param options - {@link ClientsPlayersOptions}
   * @returns The created TryCP clients and all conductors per client and all
   * agents' hApps per conductor.
   */
  async addClientsPlayers(serverUrls: URL[], options?: ClientsPlayersOptions) {
    const clientsPlayers: Array<{
      client: TryCpClient;
      players: TryCpPlayer[];
    }> = [];

    // create client connections for specified URLs
    for (const serverUrl of serverUrls) {
      const client = await this.addClient(serverUrl, options?.clientTimeout);
      const players: TryCpPlayer[] = [];
      const numberOfConductorsPerClient =
        options?.numberOfConductorsPerClient ?? 1;

      // create conductors for each client
      for (let i = 0; i < numberOfConductorsPerClient; i++) {
        const conductor = await client.addConductor(
          options?.signalHandler,
          options?.partialConfig
        );

        if (options?.numberOfAgentsPerConductor) {
          // install agents apps for each conductor
          if (options?.app === undefined) {
            throw new Error("no app specified to be installed for agents");
          }

          // TS fails to infer that options.apps cannot be `undefined` here
          const app = options.app;

          let agentsApps;
          if (options.agentPubKeys) {
            agentsApps = options.agentPubKeys.map((agentPubKey) => ({
              agentPubKey,
              app,
            }));
          } else {
            agentsApps = [...Array(options.numberOfAgentsPerConductor)].map(
              () => ({ app })
            );
          }

          const installedAgentsHapps = await conductor.installAgentsApps({
            agentsApps,
          });
          installedAgentsHapps.forEach((agentHapps) =>
            players.push({ conductor, ...agentHapps })
          );
        }
      }
      clientsPlayers.push({ client, players });
    }
    return clientsPlayers;
  }

  /**
   * Creates and adds a single player with an installed app to the scenario,
   *
   * @param tryCpClient - The client connection to the TryCP server on which to
   * create the player.
   * @param appBundleSource - The bundle or path of the app.
   * @param options - {@link AppOptions} like agent pub key etc.
   * @returns The created player instance.
   */
  async addPlayerWithApp(
    tryCpClient: TryCpClient,
    appBundleSource: AppBundleSource,
    options?: AppOptions
  ) {
    const conductor = await tryCpClient.addConductor(options?.signalHandler);
    options = {
      ...options,
      networkSeed: options?.networkSeed ?? this.network_seed,
    };
    const agentApp = await conductor.installApp(appBundleSource, options);
    const player: TryCpPlayer = { conductor, ...agentApp };
    return player;
  }

  /**
   * Creates and adds multiple players with an installed app to the scenario.
   *
   * @param tryCpClient - The client connection to the TryCP server on which to
   * create the player.
   * @param playersApps - An array with an app for each player.
   * @returns An array of the added players.
   */
  async addPlayersWithApps(
    tryCpClient: TryCpClient,
    playersApps: Array<{
      appBundleSource: AppBundleSource;
      options?: AppOptions;
    }>
  ) {
    const players = await Promise.all(
      playersApps.map(async (playerHappBundle) =>
        this.addPlayerWithApp(
          tryCpClient,
          playerHappBundle.appBundleSource,
          playerHappBundle.options
        )
      )
    );
    return players;
  }

  /**
   * Registers all agents of all passed in conductors to each other. This skips
   * peer discovery through gossip and thus accelerates test runs.
   */
  async shareAllAgents() {
    return shareAllAgents(
      this.clients.map((client) => client.conductors).flat()
    );
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
    const conductors = this.clients.map((client) => client.conductors).flat();
    return awaitDhtSync(conductors, cellId, interval, timeout);
  }

  /**
   * Shut down all conductors of all clients in the scenario.
   */
  async shutDown() {
    await Promise.all(
      this.clients.map((client) => client.shutDownConductors())
    );
    if (this.servicesProcess) {
      await stopLocalServices(this.servicesProcess);
    }
  }

  /**
   * Shut down and delete all conductors and close all client connections in
   * the scenario.
   */
  async cleanUp() {
    await Promise.all(this.clients.map((client) => client.cleanUp()));
    if (this.servicesProcess) {
      await stopLocalServices(this.servicesProcess);
    }
    this.clients = [];
    this.servicesProcess = undefined;
    this.bootstrapServerUrl = undefined;
    this.signalingServerUrl = undefined;
  }
}
