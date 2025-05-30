<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@holochain/tryorama](./tryorama.md) &gt; [NetworkConfig](./tryorama.networkconfig.md) &gt; [initiateIntervalMs](./tryorama.networkconfig.initiateintervalms.md)

## NetworkConfig.initiateIntervalMs property

The interval in seconds between initiating gossip rounds.

This controls how often gossip will attempt to find a peer to gossip with. This can be set as low as you'd like, but you will still be limited by minInitiateIntervalMs. So a low value for this will result in gossip doing its initiation in a burst. Then, when it has run out of peers, it will idle for a while.

Default: 100

**Signature:**

```typescript
initiateIntervalMs?: number;
```
