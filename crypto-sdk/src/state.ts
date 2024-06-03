import { Barretenberg, Fr } from "@aztec/bb.js";
import { MerkleProof, Tree } from "./merkle-tree.js"; 
import { FrHashed, Hashable } from "./util.js"; 
import { ShardedStorageSettings } from "./settings.js";

export class Account implements Hashable {
  /// x coordinate of the owner account public key
  key: Fr;
  /// Balance
  balance: Fr;
  // Nonce
  nonce: Fr;
  // Mining nonce
  random_oracle_nonce: Fr;

  constructor() {
    this.key = Fr.ZERO;
    this.balance = Fr.ZERO;
    this.nonce = Fr.ZERO;
    this.random_oracle_nonce = Fr.ZERO;
  }

  async hash(bb: Barretenberg): Promise<Fr> {
    if (this.key == Fr.ZERO) {
        // Hash zero account
        return bb.poseidon2Hash([Fr.ZERO, Fr.ZERO, Fr.ZERO, Fr.ZERO]);
    } else {
        return bb.poseidon2Hash([this.key, this.balance, this.nonce, this.random_oracle_nonce]);
    }
  }
};

export class File implements Hashable {
  expiration_time: Fr;
  // Owner account pk
  owner: Fr;
  // File contents serialized as a list of Fr. Null when file is not initialized
  data: null | Tree<FrHashed>;

  constructor() {
    this.expiration_time = Fr.ZERO;
    this.owner = Fr.ZERO;
    this.data = null;
  }

  async hash(bb: Barretenberg): Promise<Fr> {
    if (this.data == null) {
        // Hash empty file
        return bb.poseidon2Hash([Fr.ZERO, Fr.ZERO, Fr.ZERO, Fr.ZERO]);
    } else {
        return bb.poseidon2Hash([this.expiration_time, this.owner, await this.data.hash(bb)]);
    }
  }
};

export class State {
  accounts: Tree<Account>;
  files: Tree<File>;

  constructor(x: never) {
    this.accounts = x;
    this.files = x;
  }

  async newState(bb: Barretenberg, sett: ShardedStorageSettings): Promise<State> {
    return {
      accounts: await Tree.init(
        bb,
        sett.acc_data_tree_depth,
        new Array(1 << sett.acc_data_tree_depth).fill(new Account())
      ),
      files: await Tree.init(
        bb,
        sett.acc_data_tree_depth,
        new Array(1 << sett.acc_data_tree_depth).fill(new File())
      ),
    } as State;
  }

}
