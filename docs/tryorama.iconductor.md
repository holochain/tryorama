<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@holochain/tryorama](./tryorama.md) &gt; [IConductor](./tryorama.iconductor.md)

## IConductor interface

Base interface of a Tryorama conductor. Both [Conductor](./tryorama.conductor.md) and [TryCpConductor](./tryorama.trycpconductor.md) implement this interface.

**Signature:**

```typescript
export interface IConductor 
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

[adminWs](./tryorama.iconductor.adminws.md)


</td><td>


</td><td>

() =&gt; [IAdminWebsocket](./tryorama.iadminwebsocket.md)


</td><td>


</td></tr>
<tr><td>

[connectAppWs](./tryorama.iconductor.connectappws.md)


</td><td>


</td><td>

(token: AppAuthenticationToken, port: number) =&gt; Promise&lt;[IAppWebsocket](./tryorama.iappwebsocket.md)<!-- -->&gt;


</td><td>


</td></tr>
<tr><td>

[installAgentsApps](./tryorama.iconductor.installagentsapps.md)


</td><td>


</td><td>

(options: [AgentsAppsOptions](./tryorama.agentsappsoptions.md)<!-- -->) =&gt; Promise&lt;AppInfo\[\]&gt;


</td><td>


</td></tr>
<tr><td>

[installApp](./tryorama.iconductor.installapp.md)


</td><td>


</td><td>

(appBundleSource: AppBundleSource, options?: [AppOptions](./tryorama.appoptions.md)<!-- -->) =&gt; Promise&lt;AppInfo&gt;


</td><td>


</td></tr>
<tr><td>

[shutDown](./tryorama.iconductor.shutdown.md)


</td><td>


</td><td>

() =&gt; Promise&lt;number \| null&gt;


</td><td>


</td></tr>
<tr><td>

[startUp](./tryorama.iconductor.startup.md)


</td><td>


</td><td>

() =&gt; Promise&lt;void \| null&gt;


</td><td>


</td></tr>
</tbody></table>
