<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@holochain/tryorama](./tryorama.md) &gt; [TryCpClient](./tryorama.trycpclient.md) &gt; [ping](./tryorama.trycpclient.ping.md)

## TryCpClient.ping() method

Send a ping with data.

**Signature:**

```typescript
ping(data: unknown): Promise<Buffer>;
```

## Parameters

<table><thead><tr><th>

Parameter


</th><th>

Type


</th><th>

Description


</th></tr></thead>
<tbody><tr><td>

data


</td><td>

unknown


</td><td>

Data to send and receive with the ping-pong.


</td></tr>
</tbody></table>
**Returns:**

Promise&lt;Buffer&gt;

A promise that resolves when the pong was received.

