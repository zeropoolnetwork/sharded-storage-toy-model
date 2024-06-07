import { Fr } from '@aztec/bb.js';
import { Barretenberg } from '@aztec/bb.js';
import { ShardedStorageSettings } from './settings';

export type MiningResult = {
  mining_nonce: number,
  bruteforce_hash: Fr,
  index_hash: Fr,
  index: bigint,
  data: Fr,
  mining_hash: Fr,
};

function keepLower(f: bigint, n: number): bigint {
  const mask = 2n ** BigInt(n) - 1n;
  return f & mask;
}

function trimLower(f: bigint, n: number): bigint {
  return BigInt(f.toString()) / (2n ** BigInt(n));
}

function bigIntFromBuffer(b: Buffer, start: number, len: number): bigint {
  let acc = 0n;
  b.slice(start, len).forEach((byte, index) => {
    acc = acc * 256n + BigInt(byte);
  });

  return acc;
}

// FIXME: we use one one sameple, production will use more
export async function mine(
  sett: ShardedStorageSettings,
  // file_id is a leaf index (path) in data Merkle tree
  // word_id is a leaf index in Merkle tree of this file
  storage_read: (file_id: bigint, word_id: bigint) => Fr,
  bb: Barretenberg,
  pk: Fr,
  oracle: Fr,
): Promise<MiningResult | null> {

  for (let mining_nonce = 0; mining_nonce < sett.mining_max_nonce; ++mining_nonce) {
    const bruteforce_hash =
      await bb.poseidon2Hash([pk, oracle, Fr.fromString(mining_nonce.toString())]);
    const index_hash = 
      await bb.poseidon2Hash([bruteforce_hash]);
    const index : bigint = keepLower(
        BigInt(index_hash.toString()),
        sett.acc_data_tree_depth + sett.file_tree_depth
    );

    const file_in_storage_index = keepLower(index, sett.acc_data_tree_depth);
    const word_in_file_index = trimLower(index, sett.acc_data_tree_depth);

    const data = storage_read(file_in_storage_index, word_in_file_index);

    const mining_hash =
      await bb.poseidon2Hash([bruteforce_hash, data]);

    if (BigInt(mining_hash.toString()) < sett.mining_difficulty)
      return {
        mining_nonce: mining_nonce,
        bruteforce_hash: bruteforce_hash,
        index_hash: index_hash,
        index: BigInt(index.toString()),
        data: data,
        mining_hash: mining_hash,
      }
  }

  return null;
}
