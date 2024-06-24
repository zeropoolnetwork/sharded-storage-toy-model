import { MerkleProof, Tree } from 'zpst-crypto-sdk/src/merkle-tree';
import { accountData, nodePk, storage } from './state';
import { bufferToFrElements } from 'zpst-common';
import { poseidon2_bn256_hash } from 'zpst-poseidon2-bn256';
import { mine } from 'zpst-crypto-sdk';
import { defShardedStorageSettings } from 'zpst-crypto-sdk/src/settings';
import { MiningResult } from 'zpst-crypto-sdk/src/mining';
import { prep_mining_tx } from 'zpst-crypto-sdk/src/util';
import { MiningTx, SignaturePacked } from 'zpst-crypto-sdk/src/noir_codegen';
import { NODE_SK } from './env';

export async function uploadSegments(segments: Buffer[]): Promise<void> {
  const promises = segments.map(async (segment) => {
    const elements = bufferToFrElements(segment);
    const tree = Tree.init(defShardedStorageSettings.file_tree_depth, elements, (num) => BigInt(poseidon2_bn256_hash([num.toString()])));

    await storage.write(tree.root.toString(), tree.serialize());
  });

  await Promise.all(promises);
}

export interface UploadAndMineResponse {
  miningRes: MiningResult,
  word: [MerkleProof, bigint],
  tx: [MiningTx, SignaturePacked],
}

export async function mineSegment(roValues: bigint[], globalRoOffset: bigint): Promise<UploadAndMineResponse> {
  const roOffset = Math.floor(Math.random() * roValues.length);
  const roVal = roValues[roOffset];

  const miningRes = await mine(defShardedStorageSettings, nodePk, roVal, async (file_id, word_id) => {
    const segment = await storage.read(file_id.toString());

    let tree: Tree<bigint>;
    if (segment) {
      tree = new Tree<bigint>(0, [], [], (v: bigint) => v);
      tree.deserialize(segment, () => BigInt(0));
    } else {
      tree = Tree.init(defShardedStorageSettings.file_tree_depth, new Array(1 << defShardedStorageSettings.file_tree_depth).fill(0n), (x) => x);
    }

    const leaf = tree.leaf(Number(word_id));

    return leaf;
  });

  const miningTx = await prep_mining_tx(Number(accountData.index), miningRes, NODE_SK, accountData.nonce, globalRoOffset + BigInt(roOffset));

  const segment = await storage.read(miningRes.file_in_storage_index.toString());
  if (!segment) {
    throw new Error('Segment not found');
  }

  const tree = new Tree<bigint>(0, [], [], (v: bigint) => v);
  tree.deserialize(segment, () => BigInt(0));

  const word = tree.readLeaf(Number(miningRes.word_in_file_index));

  return {
    miningRes,
    word,
    tx: miningTx,
  };
}
