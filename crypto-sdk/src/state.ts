import { Barretenberg, Fr } from "@aztec/bb.js";
import { MerkleProof, Tree, newTree, root } from "./merkle-tree.js"; 
import { ShardedStorageSettings } from "./settings.js";

type Option<T> = T | null;

type Account = {
    /// x coordinate of the owner account public key
    key: Fr,
    /// Balance
    balance: Fr,
    // Nonce
    nonce: Fr,
    // Mining nonce
    random_oracle_nonce: Fr
};

type File = {
  expiration_time: Fr,
  // Owner account pk
  owner: Fr,
  // File contents serialized as a list of Fr. Null when file is not initialized
  data: Tree<Fr>,
};

type State = {
  accounts: Tree<Option<Account>>,
  files: Tree<Option<File>>,
};

export async function newState(bb: Barretenberg, sett: ShardedStorageSettings): Promise<State> {
  async function hash_acc_leaf(x: Option<Account>): Promise<Fr> {
    switch (x) {
      case null:
        // Hash zero account
        return bb.poseidon2Hash([Fr.ZERO, Fr.ZERO, Fr.ZERO, Fr.ZERO]);
      default:
        return bb.poseidon2Hash([x.key, x.balance, x.nonce, x.random_oracle_nonce]);
    }
  }
  async function hash_file_leaf(x: Option<File>): Promise<Fr> {
    switch (x) {
      case null:
        // Hash empty file
        return bb.poseidon2Hash([Fr.ZERO, Fr.ZERO, Fr.ZERO, Fr.ZERO]);
      default:
        return bb.poseidon2Hash([x.expiration_time, x.owner, root(x.data)]);
    }
  }
  async function hash_node(vs: [Fr, Fr]): Promise<Fr> {
    return bb.poseidon2Hash(vs);
  }
  return {
    accounts: await newTree(
      hash_acc_leaf,
      hash_node,
      sett.acc_data_tree_depth,
      new Array(1 << sett.acc_data_tree_depth).fill(null)
    ),
    files: await newTree(
      hash_file_leaf,
      hash_node,
      sett.acc_data_tree_depth,
      new Array(1 << sett.acc_data_tree_depth).fill(null)
    ),
  };
}
