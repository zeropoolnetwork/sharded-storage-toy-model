// Taken from crypto-sdk
// TODO: Move into a separate package

import { derivePublicKey, signMessage } from '@zk-kit/eddsa-poseidon';
import { poseidon2_bn256_hash } from 'zpst-poseidon2-bn256';

type Field = string;

export type SignaturePacked = {
  a: Field;
  s: Field;
  r8: Field;
};

export type AccountTx = {
  sender_index: Field;
  receiver_index: Field;
  receiver_key: Field;
  amount: Field;
  nonce: Field;
};

export type FileTx = {
  sender_index: Field;
  data_index: Field;
  time_interval: Field;
  data: Field;
  nonce: Field;
};


/// This function prepares the account transaction. It does not use global
/// accounts tree and is suitable for running on client that doesn't have
/// access to it. It also doesn't do any balance checks (since it doesn't know
/// balances), it's up to the caller to ensure this.
///
/// Outputs of this function should be passed to Tree.build_account_tx_assets
/// (by sequencer) to make a full transaction to be passed to contract.
export async function prep_account_tx(
  amount: bigint,
  /// Account leaf indices in global merkle tree, from 0 to 2^depth-1
  sender_index: number,
  receiver_index: number,
  /// Sender and receiver keys, using zk-kit/eddsa-poseidon format (pk packed
  /// into x coordinate)
  sender_sk: string,
  receiver_pk: bigint,
  /// Sender account's nonce. Increases by 1 with each transaction from sender
  nonce: bigint,
): Promise<[AccountTx, SignaturePacked]> {

  const tx: AccountTx = {
    sender_index: sender_index.toString(),
    receiver_index: receiver_index.toString(),
    receiver_key: receiver_pk.toString(),
    amount: amount.toString(),
    nonce: nonce.toString(),
  };

  const m = poseidon2_bn256_hash(
    [tx.sender_index, tx.receiver_index, tx.receiver_key, tx.amount, tx.nonce]
  );
  const sigma = signMessage(sender_sk, m);
  const sign: SignaturePacked = {
    a: derivePublicKey(sender_sk)[0].toString(),
    s: sigma.S.toString(),
    r8: sigma.R8[0].toString(),
  };

  return [tx, sign];
}

/// Same as prep_account_tx, but for file transactions.
export async function prep_file_tx(
  time_interval: bigint,
  /// Sender leaf indices in accounts merkle tree and file index in files merkle tree
  sender_index: number,
  data_index: number,
  /// Contents hash
  data: bigint,
  /// Sender key, using zk-kit/eddsa-poseidon format (pk packed into x coordinate)
  sender_sk: string,
  /// Sender account's nonce. Increases by 1 with each transaction from sender
  nonce: bigint,
): Promise<[FileTx, SignaturePacked]> {

  const tx: FileTx = {
    sender_index: sender_index.toString(),
    data_index: data_index.toString(),
    time_interval: time_interval.toString(),
    data: data.toString(),
    nonce: nonce.toString(),
  };

  const m = poseidon2_bn256_hash(
    [tx.sender_index, tx.data_index, tx.time_interval, tx.data, tx.nonce]
  );
  const sigma = signMessage(sender_sk, m);
  const sign: SignaturePacked = {
    a: derivePublicKey(sender_sk)[0].toString(),
    s: sigma.S.toString(),
    r8: sigma.R8[0].toString(),
  };

  return [tx, sign];
}