# Zeropool Sharded Storage Toy Model

This repo contains a toy model of Zeropool's Sharded Storage solution.
A public instance of this toy model is currently running on <https://storage.zeropool.network/>.

## Index

The toy model consists of the following components:

1. Smart-contract, `./smart-contracts/`.
   Holds the hash of current state and verifies zkSNARK transactions.
2. Sequencer, `./sequencer/`.
   Batches transactions together, generates zkSNARK proofs for the contract.
3. Client node `./client-app/`.
   Runs in the browser of each client,
     sends sequencer the transactions to manage accounts and files,
     move balances and upload new files.
4. Storage node `./storage-node/`.
   Stores the contents of client's files,
     continuously mines on the stored data and collects mining rewards.

Directory `./circuits/` contains the code of zkSNARK circuit in Noir,
  while `./crypto-sdk/`, `./poseidon2-bn256/` and `./common/` are modules shared by the components above.

## Scope

The toy model is limited in scope and intentionally makes a few simplifying assumptions
  compared to the
  [Sharded Storage Proposal](https://ethresear.ch/t/blockchain-sharded-storage-web2-costs-and-web3-security-with-shamir-secret-sharing/18881).

The core concept this toy example demonstrates is
  storing the transactions of Sharded Storage rollup inside Sharded Storage itself.
Each time the rollup (sequencer) applies a block of transactions $B$ to the contract state,
  it additionally appends a service transaction “save $B$ inside a new file” to it.
This is checked by the zkSNARK proof (verified on the smart-contract).
In other words, the contract accepts the block of transactions
  if and only if the rollup and the storage node bind themselves
  to store the transaction's data for a period of time (1000 days currently).
The newly created file is stored alongside regular client files,
  but additionally gets locked from any modifications until it expires.

In other words,
  the rollup convinces the smart-contract that
  the transaction was done correctly
  and that the transaction data is safely stored using a single zkSNARK proof.

Coordinating multiple storage nodes is out of the scope of this toy model.
We run only one storage node that always stays online and centrally keeps the data of all clients,
  and do not implement fault-tolerance or deduplication protection (plotting).

## Links

 - [Public instance running this code](https://storage.zeropool.network/).
 - [Blockchain Sharded Storage: Web2 Costs and Web3 Security with Shamir Secret Sharing](https://ethresear.ch/t/blockchain-sharded-storage-web2-costs-and-web3-security-with-shamir-secret-sharing/18881).
 - [Writeup for ZeroPool’s Sharded Storage Solution: Building the Protocol Bottom Up](https://zeropool.network/pdf/WriteupZeroPoolShardedStorage.pdf)
