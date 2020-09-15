import { CapSecret } from "@holochain/conductor-api"

export const notImplemented = new Error("Not implemented!")

export const fakeCapSecret = (): CapSecret => Buffer.from(Array(64).fill('aa').join(''), 'hex')
