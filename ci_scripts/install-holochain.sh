#!/bin/bash

REV=afdb4e949b77cc81afa1b0601cf406dc08587b45
LAIR_REV=be5868e6dcbe99c795a101c0e27ba6ed5edd557d

cargo install --force holochain \
  --git https://github.com/holochain/holochain.git \
  --rev $REV
cargo install --force dna_util \
  --git https://github.com/holochain/holochain.git \
  --rev $REV
cargo install --force lair_keystore \
  --git https://github.com/holochain/lair.git \
  --rev $LAIR_REV
