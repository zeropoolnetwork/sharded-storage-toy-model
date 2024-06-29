## Building

This circuit is built using Nargo (`nargo`) and Barretenberg (`bb`) tools.

For installation instructions, see Noir docs:
  [Nargo](https://noir-lang.org/docs/getting_started/installation/) and
  [Barretenberg](https://noir-lang.org/docs/dev/getting_started/barretenberg/) (development docs as of June 2024).
The crypto-sdk was tested with `nargo` version 0.30.0 and `bb` version `0.41.0`.

Build the circuit with:

```
nargo compile
bb write_vk -b ./target/circuits.json -o ./target/vk
```

After that, the circuit is ready for use with `../crypto-sdk/`.
