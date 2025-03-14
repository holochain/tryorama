import { AgentPubKey, AppBundleSource, SignalCb } from "@holochain/client";
import { ChildProcessWithoutNullStreams } from "node:child_process";
import { URL } from "url";
import { v4 as uuidv4 } from "uuid";
import {
  enableAndGetAgentApp,
  addAllAgentsToAllConductors as shareAllAgents,
  stopLocalServices,
} from "../../common.js";
import { AppOptions, IPlayer } from "../../types.js";
import { TryCpClient } from "../trycp-client.js";
import { TryCpConductor } from "./conductor.js";
import { TryCpConductorLogLevel } from "../types";

/**
 * @public
 */
export interface ClientsPlayersOptions {
  /**
   * An app that will be installed for each agent.
   */
  app: AppBundleSource;

  /**
   * A timeout for the web socket connection (optional).
   */
  clientTimeout?: number;

  /**
   * A list of previously generated agent pub keys (optional).
   */
  agentPubKeys?: AgentPubKey[];

  /**
   * Number of conductors per client. Defaults to 1.
   */
  numberOfConductorsPerClient?: number;

  /**
   * Number of agents per conductor. Defaults to 1.
   */
  numberOfAgentsPerConductor?: number;

  /**
   * Configuration for the conductor (optional).
   */
  partialConfig?: string;

  /**
   * A signal handler to be registered in conductors.
   */
  signalHandler?: SignalCb;
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
 * A TryCP client and its associated players.
 *
 * @public
 */
export interface ClientPlayers {
  client: TryCpClient;
  players: TryCpPlayer[];
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
  private noDpki: boolean;
  private dpkiNetworkSeed: string;
  network_seed: string;
  servicesProcess: ChildProcessWithoutNullStreams | undefined;
  bootstrapServerUrl: URL | undefined;
  signalingServerUrl: URL | undefined;
  clients: TryCpClient[];

  constructor() {
    this.noDpki = true;
    this.dpkiNetworkSeed = uuidv4();
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
   * If no number of agents per conductor is specified, it defaults to 1.
   *
   * @param serverUrls - The TryCP server URLs to connect to.
   * @param options - {@link ClientsPlayersOptions}
   * @returns The created TryCP clients and all conductors per client and all
   * agents' hApps per conductor.
   */
  async addClientsPlayers(serverUrls: URL[], options: ClientsPlayersOptions) {
    const clientsCreated: Promise<ClientPlayers>[] = [];
    // create client connections for specified URLs
    for (const serverUrl of serverUrls) {
      const clientCreated = this.addClient(
        serverUrl,
        options?.clientTimeout
      ).then(async (client) => {
        const numberOfConductorsPerClient =
          options?.numberOfConductorsPerClient ?? 1;
        const conductors: {
          conductor: TryCpConductor;
          players: TryCpPlayer[];
        }[] = [];
        // create conductors for each client
        for (let i = 0; i < numberOfConductorsPerClient; i++) {
          // Conductors must be created in sequence to avoid identical admin ports being assigned multiple times.
          const conductor = await client.addConductor({
            partialConfig: options?.partialConfig,
            // noDpki: this.noDpki,
            // Set a common unique DPKI network seed.
            // dpkiNetworkSeed: this.noDpki ? "" : this.dpkiNetworkSeed,
          });
          const app = options.app;
          let appOptions;
          if (options.agentPubKeys) {
            appOptions = options.agentPubKeys.map((agentPubKey) => ({
              agentPubKey,
              app,
            }));
          } else {
            appOptions = [...Array(options.numberOfAgentsPerConductor)].map(
              () => ({ app })
            );
          }

          const appInfos = await conductor.installAgentsApps({
            agentsApps: appOptions,
          });
          const adminWs = conductor.adminWs();
          const players: TryCpPlayer[] = [];
          for (const appInfo of appInfos) {
            const { port } = await adminWs.attachAppInterface();
            const issued = await adminWs.issueAppAuthenticationToken({
              installed_app_id: appInfo.installed_app_id,
            });
            // This doesn't make a lot of sense... but we are asking the trycp server to create a connection,
            // which needs to be authenticated here.
            await conductor.connectAppInterface(issued.token, port);
            // Then here we are just connecting to the same backend connection, but we don't actually need to
            // authenticate. We still have to follow the same interface to 'connect' though, even though this
            // isn't establishing a connection.
            const appWs = await conductor.connectAppWs(issued.token, port);
            const agentApp = await enableAndGetAgentApp(
              adminWs,
              appWs,
              appInfo
            );
            players.push({
              conductor,
              appWs,
              ...agentApp,
            });
          }
          conductors.push({ conductor, players });
        }
        const playersForClient = conductors.flatMap(
          (conductorForClient) => conductorForClient.players
        );
        return { client, players: playersForClient };
      });
      clientsCreated.push(clientCreated);
    }
    return Promise.all(clientsCreated);
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
    options?: AppOptions & { logLevel?: TryCpConductorLogLevel }
  ) {
    const conductor = await tryCpClient.addConductor({
      logLevel: options?.logLevel,
      // noDpki: this.noDpki,
      // dpkiNetworkSeed: this.dpkiNetworkSeed,
    });
    options = {
      ...options,
      networkSeed: options?.networkSeed ?? this.network_seed,
    };
    const appInfo = await conductor.installApp(appBundleSource, options);
    const adminWs = conductor.adminWs();
    const { port } = await adminWs.attachAppInterface();
    const issued = await adminWs.issueAppAuthenticationToken({
      installed_app_id: appInfo.installed_app_id,
    });
    await conductor.connectAppInterface(issued.token, port);
    const appWs = await conductor.connectAppWs(issued.token, port);
    const agentApp = await enableAndGetAgentApp(adminWs, appWs, appInfo);
    if (options.signalHandler) {
      conductor.on(port, options.signalHandler);
    }
    const player: TryCpPlayer = { conductor, appWs: appWs, ...agentApp };
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
