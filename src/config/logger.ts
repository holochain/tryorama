export const quietLoggerConfig = {
  logger: {
    type: 'debug',
    state_dump: false,
    rules: {
      rules: [{ exclude: true, pattern: ".*" }]
    }
  }
}

export const saneLoggerConfig = {
  type: "debug",
  rules: {
    rules: [
      {
        exclude: true,
        pattern: ".*parity.*"
      },
      {
        exclude: true,
        pattern: ".*mio.*"
      },
      {
        exclude: true,
        pattern: ".*tokio.*"
      },
      {
        exclude: true,
        pattern: ".*hyper.*"
      },
      {
        exclude: true,
        pattern: ".*rusoto_core.*"
      },
      {
        exclude: true,
        pattern: ".*want.*"
      },
      {
        exclude: true,
        pattern: ".*rpc.*"
      }
    ]
  },
  state_dump: true,
}