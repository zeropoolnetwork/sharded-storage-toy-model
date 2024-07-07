import { PUBLIC_SEQUENCER_API_URL, PUBLIC_NODE_API_URL, PUBLIC_DEBUG_SEED } from '$env/static/public';
import { prep_file_tx } from './tx';
import { pk, sk } from '$lib';
import { SequencerClient, type AccountData, type Block, type FileMetadata, type FullFileMeta, type VacantIndicesResponse } from 'zpst-common/src/api';
import { encodeFile, bufferToFrElements, encodeSegment } from 'zpst-common/src/codec';
import { poseidon2_bn256_hash, merkle_tree } from 'zpst-poseidon2-bn256';

export const SEQUENCER_API_URL = PUBLIC_SEQUENCER_API_URL || 'http://localhost:3000';
export const NODE_API_URL = PUBLIC_NODE_API_URL || 'http://localhost:3001';

export const DEBUG_SEED: string | undefined = PUBLIC_DEBUG_SEED;

const DEFAULT_FILE_LIFETIME = 7149n * 10n; // about 10 days

let client = new SequencerClient(SEQUENCER_API_URL);

export interface UploadFileResult {
  indices: bigint[];
  metadata: FileMetadata;
}

export async function uploadFile(file: File): Promise<UploadFileResult> {
  const data = Buffer.from(await file.arrayBuffer());
  const fileName = file.name;
  const fileSize = data.byteLength;

  const account = await getAccount(pk);
  if (!account) {
    throw new Error('Cannot upload: account not found');
  }

  console.log('Received account ', account);

  const fullFileEncoded = encodeSegment(data);
  const fullFileHash = BigInt(poseidon2_bn256_hash(bufferToFrElements(fullFileEncoded).map((x) => x.toBigInt().toString())));
  const segmentedData = encodeFile(data);
  const indices = await getVacantFileIndices(segmentedData.length);

  const storageFee = 1n; // FIXME: hardcoded
  const totalFee = storageFee * DEFAULT_FILE_LIFETIME * BigInt(segmentedData.length);

  if (BigInt(account.account.balance) < totalFee) {
    throw new Error(`Not enough funds to upload the file, required: ${totalFee}, available: ${account.account.balance}`);
  }

  let nonce = BigInt(account.account.nonce);
  const segments = segmentedData.map((segmentData, index) => {
    console.log(`Preparing segment ${index}...`);
    const elements = bufferToFrElements(segmentData).map((x) => x.toBigInt().toString());

    console.log('Building merkle tree...')
    const depth = 10; // FIXME: hardcoded
    const tree = merkle_tree(depth, elements, '0');
    const root = tree[1];

    const accNonce = nonce + BigInt(index);

    console.log('nonce', accNonce);

    const fileIndex = indices[index];
    const [tx, signature] = prep_file_tx(
      DEFAULT_FILE_LIFETIME,
      Number(account.index),
      fileIndex,
      BigInt(root),
      sk.toString(),
      accNonce,
    );

    return { tx, signature, data: Buffer.from(segmentData).toString('base64'), order: index };
  });

  console.log(`Uploading ${segments.length} segment(s), `, ' file size:', fileSize, ', file name:', fileName, ', file hash:', fullFileHash);
  await client.upload({ segments, fileMetadata: { size: fileSize, path: fileName, hash: fullFileHash } });

  console.log('Upload complete');

  return {
    indices: indices.map((x) => BigInt(x)),
    metadata: { size: fileSize, path: fileName, hash: fullFileHash },
  };
}

export async function faucet(): Promise<{ index: number, account: AccountData }> {
  return await client.faucet(pk);
}

export async function getVacantIndices(): Promise<VacantIndicesResponse> {
  return await client.getVacantIndices();
}

export async function getVacantFileIndices(num: number): Promise<number[]> {
  return await client.getVacantFileIndices(num);
}

export async function getAccount(publicKey: bigint): Promise<{ index: number, account: AccountData } | null> {
  try {
    return await client.getAccount(publicKey);
  } catch (err) {
    return null;
  }
}

export async function getLatestBlocks(): Promise<Block[]> {
  return await client.getLatestBlocks();
}

export async function getFiles(): Promise<FullFileMeta[]> {
  return await client.getFiles(pk);
}

export async function checkStatus(): Promise<{ rollup: boolean, node: boolean, blockInProgress: boolean }> {
  let rollup = false;
  let blockInProgress = false;
  try {
    const rollupRes = await fetch(`${SEQUENCER_API_URL}/status`);
    if (rollupRes.ok) {
      const status = await rollupRes.json();
      rollup = status.status === 'OK';
      blockInProgress = status.blockInProgress;
    }
  } catch (err) { }

  let node = false;
  try {
    const nodeRes = await fetch(`${NODE_API_URL}/status`);
    node = nodeRes.ok && (await nodeRes.json()).status === 'OK';
  } catch (err) { }

  return { rollup, node, blockInProgress };
}
