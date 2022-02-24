# Tryorama Control Protocol (TryCP) server

TryCP is a protocol to enable remote management of Holochain conductors on network hosts.

## Table of contents

[Call signature](#call-signature)
[Requests](#requests)
[configure_player](#configureplayer)
[startup](#startup)

> Data types in Rust syntax

## Response
Responses are composed of an object with either `0` or `1` as a property for success or error. In case of success the value is `null`, whereas errors return a `string` with the error message.

## Call signature
- `id` { u64 } The request id
- `request` { Enum } Enum
Calls to the TryCP server are composed of a request id and the request data. Following there's a list of all possible requests.

## Requests
### configure_player
- `type` { "configure_player" }
- `id` { String } The player id
- `partial_config` { String } The Holochain configuration that is not provided by TryCP. For example:
```yaml
signing_service_uri: ~
encryption_service_uri: ~
decryption_service_uri: ~
dpki: ~
network: ~
```
Creates files and folders for a new player.

### startup
- `type` { "startup" }
- `id` { String } The player id
- `log_level` { Option<String> } One of the log levels "error", "warn", "info", "debug", "trace" of the [log crate](https://docs.rs/log/latest/log/enum.Level.html); optional
Startup the player's conductor.

### shutdown
- `type` { "shutdown" }
- `id` { String } The player id
- `signal` { Option<String> } One of the kill signals "SIGTERM", "SIGKILL", "SIGINT"; defaults to "SIGTERM"; optional
Shutdown the player's conductor.

### reset
- `type` { "reset" }
Shutdown and delete all conductors.

### download_dna
- `type` { "download_dna" } 
- `url` { String } A file or web URL to download the DNA from
Downloads a DNA from a web or file system URI and returns the path at which it is stored.

### save_dna
- `type` { "save_dna" }
- `id` { String } Identifier of the DNA
- `content` { Vec<u8> } DNA content as byte array
Stores the given DNA and returns the path at which it is stored.

### connect_app_interface
- `type` { "connect_app_interface" }
- `port` { u16 } The port to open as app interface port
Attach an app interface to the specified port.

### disconnect_app_interface
- `type` { "disconnect_app_interface" }
- `port` { u16 } The app interface port to disconnect
Remove the app interface from the specified port.

### call_app_interface
- `type` { "call_app_interface" }
- `port` { u16 } The app interface port to send the message to
- `message` { Vec<u8> } The hApp call serialized to a byte array
Call the conductor's app interface with a specific zome call.

### call_admin_interface
- `type` { "call_admin_interface" }
- `id` { String } The player's id
- `message` { Vec<u8> } The hApp call serialized to a byte array
Call the conductor's admin interface with a speficic admin call.