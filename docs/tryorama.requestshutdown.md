<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@holochain/tryorama](./tryorama.md) &gt; [RequestShutdown](./tryorama.requestshutdown.md)

## RequestShutdown interface

Request shutdown of a conductor.

**Signature:**

```typescript
export interface RequestShutdown 
```

## Properties

<table><thead><tr><th>

Property


</th><th>

Modifiers


</th><th>

Type


</th><th>

Description


</th></tr></thead>
<tbody><tr><td>

[id](./tryorama.requestshutdown.id.md)


</td><td>


</td><td>

[ConductorId](./tryorama.conductorid.md)


</td><td>


</td></tr>
<tr><td>

[signal?](./tryorama.requestshutdown.signal.md)


</td><td>


</td><td>

"SIGTERM" \| "SIGKILL" \| "SIGINT"


</td><td>

_(Optional)_


</td></tr>
<tr><td>

[type](./tryorama.requestshutdown.type.md)


</td><td>


</td><td>

"shutdown"


</td><td>


</td></tr>
</tbody></table>
