# Changelog
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

