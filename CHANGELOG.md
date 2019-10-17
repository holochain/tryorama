# Changelog
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [UNRELEASED]


## [0.1.2] - 2019-10-17

### Added

- `s.players()` can now accept an array of configs and will return an array of Players. Passing an object of configs has the same effect as previously
- There is now an `Instance` object which represents an instance inside a conductor. It can be accessed like so:
```javascript
const instance = player.instances['instanceId']
 
// the following two lines are equivalent
await instance.call('zome', 'fn', params)
await player.call('instanceId', 'zome', 'fn', params) 
```

### Changed

- When multiple conductors are starting at the same time, a mutex is used to ensure that only one DNA is downloaded at a time. This allows caching to kick in for conductors downloading the same DNA, to prevent a bunch of duplicate downloads.
- Use Memory backend for instance storage, rather than File, by default

### Fixed

- The DNA download functionality would sometimes signal completion before the file was fully downloaded and closed. Fixed that.
- The conductor timeout was getting stuck, causing lots of false positives


### Deprecated

- `s.info` deprecated in favor of `s.instance`. For now they are equivalent.


## [0.1.1] - 2019-10-08

### Added

- Add `TRYORAMA_STATE_DUMP` env var to turn on/off JSON state dump info when conductor encounters an error
- Conductor now self-destructs after 120 seconds of inactivity to allow the tests to complete even if the conductor hangs/deadlocks
- Add `TRYORAMA_STRICT_CONDUCTOR_TIMEOUT` to determine whether or not a conductor will throw an exception when it self-destructs

### Changed

- Default "verbose" logging config is more reasonable, i.e. less verbose
- Zome call timeout now has a "soft timeout" with a warning halfway through the real "hard" timeout

### Fixed

- DNA config generation would fail if `hc hash` produces output on stderr; no more

## [0.1.0] - 2019-09-23

### Added

- Ability to spawn and kill conductors arbitrarily during a test
- New syntax to support this main difference

