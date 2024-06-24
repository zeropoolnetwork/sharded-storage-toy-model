import { AccountTx, Field, FileTx, MiningTx, Field as NoirFr, RollupPubInput, SignaturePacked } from "./noir_codegen/index"; 
import { ShardedStorageSettings } from './settings';
import { keccak256 } from '@noir-lang/noir_js'; 

import { merkle_tree, poseidon2_bn256_hash } from 'zpst-poseidon2-bn256'

import { defShardedStorageSettings } from "./settings"; 

export type Fr = bigint;
const FR_MODULUS = 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001n;

import {
    derivePublicKey,
    signMessage,
    verifySignature,
    deriveSecretScalar,
    packPublicKey,
    unpackPublicKey
} from "@zk-kit/eddsa-poseidon"
import { MiningResult } from './mining';

export function bigIntToFr(x: bigint): Fr {
  return x % FR_MODULUS;
}

// Serializes Fr values for external calls (nargo or WASM bindings)
export function fr_serialize(x: bigint): string {
  return x.toString();
}

// Deserializes Fr values received from external calls (nargo or WASM bindings)
export function fr_deserialize(x: string): Fr {
  return bigIntToFr(BigInt(x));
}

// Generated using Claude AI from Noir circuit definintion
export function pub_input_hash(sett: ShardedStorageSettings, input: RollupPubInput): Fr {
  const payload: bigint[] = new Array(sett.pub_len).fill(BigInt(0));

  payload[0] = fr_deserialize(input.old_root);
  payload[1] = fr_deserialize(input.new_root);
  payload[2] = fr_deserialize(input.now);
  payload[3] = fr_deserialize(input.oracle.offset);
  for (let i = 0; i < sett.oracle_len; i++) {
    payload[4 + i] = fr_deserialize(input.oracle.data[i]);
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

  let acc = 0n;

  // use BE for Ethereum compatibility
  for (let i = 0; i < 32; i++) {
    acc = (acc * 256n + BigInt(res[i])) % FR_MODULUS;
  }

  return acc;
}

export function pad_array<T>(arr: T[], length: number, def: T): T[] {
  const padding: T[] = new Array(length - arr.length).fill(def);
  return arr.concat(padding);
}

// Helper function to convert bigint to byte array
export function bigIntToBytes(value: bigint, length: number): number[] {
  const hex = value.toString(16).padStart(length * 2, '0');
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }
  return bytes; // use BE for Ethereum compatibility
}

export function bigintToBuffer(value: bigint): Buffer {
  const buffer = Buffer.alloc(32);
  const hex = value.toString(16);
  const paddedHex = hex.padStart(64, '0');
  const valueBuffer = Buffer.from(paddedHex, 'hex');

  valueBuffer.copy(buffer, 32 - valueBuffer.length);

  return buffer;
}

export function bufferToBigint(buffer: Buffer): bigint {
  if (buffer.length !== 32) {
    throw new Error("Buffer must be exactly 32 bytes");
  }

  const hex = buffer.toString('hex');
  const value = BigInt('0x' + hex);

  return value;
}

export function frAdd(x: Fr, y: Fr): Fr {
  return bigIntToFr(x + y)
}

export function frSub(x: Fr, y: Fr): Fr {
  return bigIntToFr(x - y)
}

/// Same as prep_account_tx, but for mining transactions.
export async function prep_mining_tx(
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

  const m = poseidon2_bn256_hash(
    [tx.sender_index, tx.nonce, tx.random_oracle_nonce, tx.mining_nonce]
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


/// Packs all user-created transactions into a buffer to be stored inside Sharded Storage itself
export function pack_tx(
  acc_txs: AccountTx[],
  mining_txs: MiningTx[],
  file_txs: FileTx[],
): Fr[] {
  const sett = defShardedStorageSettings;

  let block_data: string[] = new Array(
    4*sett.file_tx_per_block
    + 2*sett.mining_tx_per_block
    + 4*sett.account_tx_per_block
  ).fill("0");

  for (let i = 0; i < sett.account_tx_per_block; ++i) {
      let offset = 4*i;
      block_data[offset] = acc_txs[i].sender_index;
      block_data[offset+1] = acc_txs[i].receiver_index;
      block_data[offset+2] = acc_txs[i].receiver_key;
      block_data[offset+3] = acc_txs[i].amount;
  }

  for (let i = 0; i < sett.mining_tx_per_block; ++i) {
      let offset = 4*sett.account_tx_per_block + 2*i;
      block_data[offset] = mining_txs[i].sender_index;
      block_data[offset+1] = mining_txs[i].random_oracle_nonce;
  }


  for (let i = 0; i < sett.file_tx_per_block - 1; ++i) {
      let offset = 4*sett.account_tx_per_block + 2*sett.mining_tx_per_block + 4*i;
      block_data[offset] = file_txs[i].sender_index;
      block_data[offset+1] = file_txs[i].data_index;
      block_data[offset+2] = file_txs[i].time_interval;
      block_data[offset+3] = file_txs[i].data;
  }

  (() => { // i = last
      let i = sett.file_tx_per_block - 1;
      let offset = 4*sett.account_tx_per_block + 2*sett.mining_tx_per_block + 4*i;
      block_data[offset] = file_txs[i].sender_index;
      block_data[offset+1] = file_txs[i].data_index;
      block_data[offset+2] = file_txs[i].time_interval;
      block_data[offset+3] = "0";
  })();


  return block_data.map(fr_deserialize);
}

export interface Serde {
  serialize(): Buffer;
  // TODO: A static method on an abstract class wouldn't work here. Have to find a better way.
  deserialize(data: Buffer, ...args: any[]): void;
}
