export type ConductorId = string;
export interface TryCpServerCall {
  id: number;
  request: TryCpServerRequest;
}

export type TryCpServerRequest =
  | TryCpServerRequestConfigurePlayer
  | TryCpServerRequestStartup;

interface TryCpServerRequestConfigurePlayer {
  type: "configure_player";
  id: string;
  partial_config: string;
}

interface TryCpServerRequestStartup {
  type: "startup";
  id: string;
  log_level?: string;
}

export interface TryCpResponseWrapper {
  type: "response";
  id: number;
  response: TryCpResponseSuccess & TryCpResponseError;
}

interface TryCpResponseSuccess {
  0: null;
}

interface TryCpResponseError {
  1: string;
}

// saveDna: async (id, contents) => {
//   if (!(id in savedDnas)) {
//     savedDnas[id] = (async () =>
//       makeCall("save_dna")({ id, content: await contents() }))();
//   }
//   return await savedDnas[id];
// },
// downloadDna: (url) => makeCall("download_dna")({ url }),
// configurePlayer: (id, partial_config) =>
//   makeCall("configure_player")({
//     id,
//     partial_config: yaml.stringify({
//       ...(partial_config.db_sync_level
//         ? { db_sync_level: partial_config.db_sync_level }
//         : {}),
//       signing_service_uri: partial_config.signing_service_uri ?? null,
//       encryption_service_uri: partial_config.encryption_service_uri ?? null,
//       decryption_service_uri: partial_config.decryption_service_uri ?? null,
//       network: partial_config.network ?? null,
//       dpki: partial_config.dpki ?? null,
//     }),
//   }),
// spawn: (id) => makeCall("startup")({ id, log_level: remoteLogLevel }),
// kill: (id, signal?) => makeCall("shutdown")({ id, signal }),
// reset: () => makeCall("reset")(undefined),
// adminInterfaceCall: (id, message) =>
//   holochainInterfaceCall("admin", { id }, message),
// appInterfaceCall: (port, message) =>
//   holochainInterfaceCall("app", { port }, message),
// connectAppInterface: (port: number) =>
//   makeCall("connect_app_interface")({ port }),
// disconnectAppInterface: (port: number) =>
//   makeCall("disconnect_app_interface")({ port }),
// subscribeAppInterfacePort: (port, onSignal) => {
//   signalSubscriptions[port] = onSignal;
// },
// unsubscribeAppInterfacePort: (port) => {
//   delete signalSubscriptions[port];
// },
// closeSession: async () => {
//   const closePromise = new Promise((resolve) => ws.on("close", resolve));
//   ws.close();
//   if (ws.readyState !== 3) {
//     await closePromise;
//   }
// },
// };
