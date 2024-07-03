import { MerkleProof, Tree } from 'zpst-crypto-sdk/src/merkle-tree';
import { mine } from 'zpst-crypto-sdk';
import { defShardedStorageSettings } from 'zpst-crypto-sdk/src/settings';
import { MiningResult } from 'zpst-crypto-sdk/src/mining';
import { prep_mining_tx } from 'zpst-crypto-sdk/src/util';
import { MiningTx, SignaturePacked } from 'zpst-crypto-sdk/src/noir_codegen';

import { appState } from './state';
import { NODE_SK } from './env';

export interface UploadAndMineResponse {
  miningRes: MiningResult;
  word: [MerkleProof, bigint];
  tx: [MiningTx, SignaturePacked];
}

export async function mineSegment(
  roValues: bigint[],
  globalRoOffset: bigint,
): Promise<UploadAndMineResponse> {
  console.log('Mining...')
  const roOffset = Math.floor(Math.random() * roValues.length);
  const roVal = roValues[roOffset];

  const miningRes = await mine(
    defShardedStorageSettings,
    appState.nodePk,
    roVal,
    async (file_id, word_id) => {
      const segment = await appState.storage.read(file_id.toString());

      let tree: Tree<bigint>;
      if (segment) {
        tree = new Tree<bigint>(0, [], [], (v: bigint) => v);
        tree.fromBuffer(segment, () => BigInt(0));
      } else {
        tree = Tree.init(
          defShardedStorageSettings.file_tree_depth,
          new Array(1 << defShardedStorageSettings.file_tree_depth).fill(0n),
          0n,
          (x) => x,
        );
      }

      const leaf = tree.leaf(Number(word_id));

      return leaf;
    },
  );

  const miningTx = prep_mining_tx(
    Number(appState.accountIndex),
    miningRes,
    NODE_SK,
    appState.accountData.nonce,
    globalRoOffset + BigInt(roOffset),
  );

  let segment = await appState.storage.read(
    miningRes.file_in_storage_index.toString(),
  );
  if (!segment) {
    segment = Buffer.alloc(1 << defShardedStorageSettings.file_tree_depth);
  }

  const tree = new Tree<bigint>(0, [], [], (v: bigint) => v);
  tree.fromBuffer(segment, () => BigInt(0));

  const word = tree.readLeaf(Number(miningRes.word_in_file_index));

  return {
    miningRes,
    word,
    tx: miningTx,
  };
}
