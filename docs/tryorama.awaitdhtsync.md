<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@holochain/tryorama](./tryorama.md) &gt; [awaitDhtSync](./tryorama.awaitdhtsync.md)

## awaitDhtSync variable

A utility function to wait until all conductors' integrated DhtOps are identical for a DNA.

<b>Signature:</b>

```typescript
awaitDhtSync: (conductors: Array<IConductor>, cellId: CellId, interval?: number, timeout?: number) => Promise<void>
```