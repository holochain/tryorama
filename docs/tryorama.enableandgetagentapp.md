<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@holochain/tryorama](./tryorama.md) &gt; [enableAndGetAgentApp](./tryorama.enableandgetagentapp.md)

## enableAndGetAgentApp() function

Enable an app and build an agent app object.

**Signature:**

```typescript
enableAndGetAgentApp: (adminWs: AdminWebsocket, appWs: AppWebsocket, appInfo: AppInfo) => Promise<AgentApp>
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

adminWs


</td><td>

AdminWebsocket


</td><td>

The admin websocket to use for admin requests.


</td></tr>
<tr><td>

appWs


</td><td>

AppWebsocket


</td><td>

The app websocket to use for app requests.


</td></tr>
<tr><td>

appInfo


</td><td>

AppInfo


</td><td>

The app info of the app to enable.


</td></tr>
</tbody></table>
**Returns:**

Promise&lt;[AgentApp](./tryorama.agentapp.md)<!-- -->&gt;

An app agent object.

