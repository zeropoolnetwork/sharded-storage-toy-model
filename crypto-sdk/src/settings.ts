// The settings you use must match the Noir code of zkSNARK circuit
export type ShardedStorageSettings = {
  // Depth of the Merkle trees that bind accounts and files data
  acc_data_tree_depth: number,

  // Depth of the Merkle trees that binds each file to a hash
  file_tree_depth: number,

  // Number of values in random oracle sliding window
  oracle_len: number,
  // Number of field elements in pub input
  pub_len: number,

  // number of transactions in a block
  account_tx_per_block: number,
  file_tx_per_block: number,
  mining_tx_per_block: number,

  // Mining settings
  mining_max_nonce: number,
  mining_difficulty: bigint,

  // Storage fee per time unit
  storage_fee: bigint,

  // Reward for successful mining
  mining_reward: bigint,
};

export const defShardedStorageSettings : ShardedStorageSettings = {
  acc_data_tree_depth: 20,
  file_tree_depth: 10,
  oracle_len: 16,
  pub_len: 4 + 16,
  account_tx_per_block: 8,
  file_tx_per_block: 8,
  mining_tx_per_block: 1,
  mining_max_nonce: 1048576,
  mining_difficulty: 28269553036454149273332760011886696253239742350009903329945699220681916416n,
  storage_fee: 1n,
  mining_reward: 1024n,
};
