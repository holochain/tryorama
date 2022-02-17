# Tryorama Control Protocol (TryCP) server

TryCP is a protocol to enable remote management of Holochain conductors on network hosts.

## Table of contents

> All data types are Rust types

## Call format
- `id` { u64 } The request id
- `request` { Enum } Enum 

Calls to the TryCP server are composed of a call id and the request data. Following there's a list of all possible requests.

## startup
- `type` { "startup" }
- `id` { String } The player's id
- `log_level` { Option<String> } One of the log levels 