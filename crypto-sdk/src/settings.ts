// The settings you use must match the Noir code of zkSNARK circuit
export type ShardedStorageSettings = {
  // Depth of the Merkle trees that bind accounts and files data
  acc_data_tree_depth: number,

  // Depth of the Merkle trees that binds each file to a hash
  file_tree_depth: number,

  // Mining settings
  mining_max_nonce: number;
  mining_difficulty: bigint;
};

export const defShardedStorageSettings : ShardedStorageSettings = {
  acc_data_tree_depth: 10,
  file_tree_depth: 10,
  mining_max_nonce: 1048576,
  mining_difficulty: 28269553036454149273332760011886696253239742350009903329945699220681916416n,
};
