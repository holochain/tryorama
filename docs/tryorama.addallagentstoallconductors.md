<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@holochain/tryorama](./tryorama.md) &gt; [addAllAgentsToAllConductors](./tryorama.addallagentstoallconductors.md)

## addAllAgentsToAllConductors() function

Add all agents of all conductors to each other. Shortcuts peer discovery through a bootstrap server or gossiping.

**Signature:**

```typescript
addAllAgentsToAllConductors: (conductors: IConductor[]) => Promise<void>
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  conductors | [IConductor](./tryorama.iconductor.md)<!-- -->\[\] | Conductors to mutually exchange all agents with. |

**Returns:**

Promise&lt;void&gt;

