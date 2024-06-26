import { ShardedStorageSettings } from './settings';
import { MiningTx, MiningTxAssets, MiningTxEx } from './noir_codegen';

import {
  Field as NoirFr,
  Account as NoirAccount,
  File as NoirFile,
  MerkleProof as NoirMerkleProof,
  AccountTx,
  AccountTxAssets,
  SignaturePacked,
  AccountTxEx,
  FileTxEx,
  FileTx,
  FileTxAssets
} from "./noir_codegen/index";
import { Fr, bigIntToFr, fr_serialize, fr_deserialize } from './util';
import { poseidon2_bn256_hash } from 'zpst-poseidon2-bn256';

export type MiningResult = {
  random_oracle_value: Fr,
  mining_nonce: number,
  bruteforce_hash: Fr,
  index_hash: Fr,
  index: bigint,
  data: Fr,
  mining_hash: Fr,
  file_in_storage_index: bigint,
  word_in_file_index: bigint,
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
  pk: Fr,
  random_oracle_value: Fr,
  // file_id is a leaf index (path) in data Merkle tree
  // word_id is a leaf index in Merkle tree of this file
  storage_read: (file_id: bigint, word_id: bigint) => Promise<Fr>,
): Promise<MiningResult> {

  for (let mining_nonce = 0; mining_nonce < sett.mining_max_nonce; ++mining_nonce) {
    const bruteforce_hash =
      poseidon2_bn256_hash([pk, random_oracle_value, bigIntToFr(BigInt(mining_nonce))].map(fr_serialize));
    const index_hash = 
      poseidon2_bn256_hash([bruteforce_hash]);
    const index : bigint = keepLower(
        BigInt(index_hash.toString()),
        sett.acc_data_tree_depth + sett.file_tree_depth
    );

    const file_in_storage_index = trimLower(index, sett.file_tree_depth);
    const word_in_file_index = keepLower(index, sett.file_tree_depth);

    const data = await storage_read(file_in_storage_index, word_in_file_index);

    const mining_hash =
      poseidon2_bn256_hash([bruteforce_hash, fr_serialize(data)]);

    if (fr_deserialize(mining_hash) < sett.mining_difficulty) {
      // console.log(`bruteforce_hash = ${frToBigInt(bruteforce_hash)}, index_hash = ${frToBigInt(index_hash)}`);
      // console.log(`indices: ${index} = ${word_in_file_index} + 2^${sett.file_tree_depth} * ${file_in_storage_index}`);

      return {
        random_oracle_value: random_oracle_value,
        mining_nonce: mining_nonce,
        bruteforce_hash: fr_deserialize(bruteforce_hash),
        index_hash: fr_deserialize(index_hash),
        index: BigInt(index.toString()),
        data: data,
        mining_hash: fr_deserialize(mining_hash),
        file_in_storage_index: file_in_storage_index,
        word_in_file_index: word_in_file_index,
      }
    }
  }

  throw Error("all mining nonces failed");
}

export function blank_mining_tx(sett: ShardedStorageSettings): MiningTxEx {
  const tx: MiningTx = {
    sender_index: "0",
    nonce: "0",
    random_oracle_nonce: "0",
    mining_nonce: "0",
  };

  const dummy_proof: NoirMerkleProof = {
    index_bits: new Array(sett.acc_data_tree_depth).fill("0"),
    hash_path: new Array(sett.acc_data_tree_depth).fill("0"),
  };

  const dummy_file_proof: NoirMerkleProof = {
    index_bits: new Array(sett.file_tree_depth).fill("0"),
    hash_path: new Array(sett.file_tree_depth).fill("0"),
  };

  const dummy_account: NoirAccount = {
    key: "0",
    balance: "0",
    nonce: "0",
    random_oracle_nonce: "0",
  }

  const dummy_file: NoirFile = {
    expiration_time: "0",
    locked: false,
    owner: "0",
    data: "0",
  };

  const dummy_signature: SignaturePacked = {
    a: "0",
    s: "0",
    r8: "0",
  };

  const assets: MiningTxAssets = {
    proof_sender: dummy_proof,
    account_sender: dummy_account,
    random_oracle_value: "0",
    proof_file: dummy_proof,
    file: dummy_file,
    proof_data_in_file: dummy_file_proof,
    data_in_file: "0",
    signature: dummy_signature,
  };

  return { tx, assets };
}
