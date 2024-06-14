import { Barretenberg, Fr } from '@aztec/bb.js';
import { AccountTx, Field, FileTx, MiningTx, Field as NoirFr, RollupPubInput, SignaturePacked } from "./noir_codegen/index"; 
import { ShardedStorageSettings } from './settings';
import { keccak256 } from '@noir-lang/noir_js'; 

import {
    derivePublicKey,
    signMessage,
    verifySignature,
    deriveSecretScalar,
    packPublicKey,
    unpackPublicKey
} from "@zk-kit/eddsa-poseidon"
import { MiningResult } from './mining';

export interface Hashable {
  hash(bb: Barretenberg): Promise<Fr>;
}

export class FrHashed extends Fr implements Hashable {
  async hash(_: Barretenberg): Promise<Fr> {
    return this;
  }

  constructor(x: Fr) {
    super(frToBigInt(x))
  }
}

export function frToBigInt(x: Fr): bigint {
  const s = x.toString();
  const res = BigInt(s.slice(0,2) + '0' + s.slice(2));
  return res;
}

export function bigIntToFr(x: bigint): Fr {
  const res = new Fr(x % Fr.MODULUS);
  return res;
}

export function frToNoir(x: Fr): NoirFr {
  return frToBigInt(x).toString();
}

export function noirToFr(x: NoirFr): Fr {
  return bigIntToFr(BigInt(x));
}

// Generated using Claude AI from Noir circuit definintion
export function pub_input_hash(sett: ShardedStorageSettings, input: RollupPubInput): FrHashed {
  const payload: bigint[] = new Array(sett.pub_len).fill(BigInt(0));

  payload[0] = BigInt(input.old_root);
  payload[1] = BigInt(input.new_root);
  payload[2] = BigInt(input.now);
  payload[3] = BigInt(input.oracle.offset);
  for (let i = 0; i < sett.oracle_len; i++) {
    payload[4 + i] = BigInt(input.oracle.data[i]);
  }

  const u8_pub_len = 32 * sett.pub_len;
  const bytesPayload = new Uint8Array(u8_pub_len);

  for (let i = 0; i < sett.pub_len; i++) {
    // use BE for Ethereum compatibility
    const bytes = bigIntToBytes(payload[i], 32);
    for (let j = 0; j < 32; j++) {
      bytesPayload[i * 32 + j] = bytes[j];
    }
  }

  const res = keccak256(bytesPayload);

  let acc = BigInt(0);

  // use BE for Ethereum compatibility
  for (let i = 0; i < 32; i++) {
    acc = acc * BigInt(256) + BigInt(res[i]);
  }

  return new FrHashed(bigIntToFr(acc));
}

export function pad_array<T>(arr: T[], length: number, def: T): T[] {
  const padding: T[] = new Array(length - arr.length).fill(def);
  return arr.concat(padding);
}

// Helper function to convert bigint to byte array
function bigIntToBytes(value: bigint, length: number): number[] {
  const hex = value.toString(16).padStart(length * 2, '0');
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }
  return bytes; // use BE for Ethereum compatibility
}

export function frAdd(x: Fr, y: Fr): Fr {
  return bigIntToFr(frToBigInt(x) + frToBigInt(y))
}

export function frSub(x: Fr, y: Fr): Fr {
  return bigIntToFr(frToBigInt(x) - frToBigInt(y))
}

/// Same as prep_account_tx, but for mining transactions.
export async function prep_mining_tx(
  bb: Barretenberg,
  /// Sender leaf indices in accounts merkle tree and file index in files merkle tree
  sender_index: number,
  /// Mining result
  mi: MiningResult,
  /// Sender sk
  sender_sk: string,
  /// Sender nonce
  nonce: bigint,
  /// RO nonce
  random_oracle_nonce: bigint,
): Promise<[MiningTx, SignaturePacked]> {

  const tx: MiningTx = {
    sender_index: sender_index.toString(),
    nonce: nonce.toString(),
    random_oracle_nonce: random_oracle_nonce.toString(),
    mining_nonce: mi.mining_nonce.toString(),
  };

  // TODO: find an implementation of poseidon2 that doesn't use Barretenberg and apply here
  const m = frToBigInt(await bb.poseidon2Hash(
    [tx.sender_index, tx.nonce, tx.random_oracle_nonce, tx.mining_nonce]
      .map(noirToFr)
  ));
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
  bb: Barretenberg,
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

  // TODO: find an implementation of poseidon2 that doesn't use Barretenberg and apply here
  const m = frToBigInt(await bb.poseidon2Hash(
    [tx.sender_index, tx.data_index, tx.time_interval, tx.data, tx.nonce]
      .map(noirToFr)
  ));
  const sigma = signMessage(sender_sk, m);
  const sign: SignaturePacked = {
    a: derivePublicKey(sender_sk)[0].toString(),
    s: sigma.S.toString(),
    r8: sigma.R8[0].toString(),
  };

  return [tx, sign];
}

/// This function prepares the account transaction. It does not use global
/// accounts tree and is suitable for running on client that doesn't have
/// access to it. It also doesn't do any balance checks (since it doesn't know
/// balances), it's up to the caller to ensure this.
///
/// Outputs of this function should be passed to Tree.build_account_tx_assets
/// (by sequencer) to make a full transaction to be passed to contract.
export async function prep_account_tx(
  bb: Barretenberg,
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

  // TODO: find an implementation of poseidon2 that doesn't use Barretenberg and apply here
  const m = frToBigInt(await bb.poseidon2Hash(
    [tx.sender_index, tx.receiver_index, tx.receiver_key, tx.amount, tx.nonce]
      .map(noirToFr)
  ));
  const sigma = signMessage(sender_sk, m);
  const sign: SignaturePacked = {
    a: derivePublicKey(sender_sk)[0].toString(),
    s: sigma.S.toString(),
    r8: sigma.R8[0].toString(),
  };

  return [tx, sign];
}
