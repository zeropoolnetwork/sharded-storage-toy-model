import { PUBLIC_SEQUENCER_API_URL, PUBLIC_NODE_API_URL } from '$env/static/public';
import { prep_account_tx, prep_file_tx, type AccountTx } from './tx';
import { pk, sk, skBuf } from '$lib';
import { SequencerClient, type AccountData, type Block, type FileMetadata, type GatewayMeta, type VacantIndicesResponse } from 'zpst-common/src/api';
import { encodeFile, bufferToFrElements } from 'zpst-common/src/codec';
import { poseidon2_bn256_hash } from 'zpst-poseidon2-bn256';

export const SEQUENCER_API_URL = PUBLIC_SEQUENCER_API_URL || 'http://localhost:3000';
export const NODE_API_URL = PUBLIC_NODE_API_URL || 'http://localhost:3001';


const DEFAULT_FILE_LIFETIME = 7149n * 10n; // about 10 days

let client = new SequencerClient(SEQUENCER_API_URL);

export interface UploadFileResult {
  indices: bigint[];
  metadata: FileMetadata;
}

export async function uploadFile(file: File): Promise<UploadFileResult> {
  const data = await file.arrayBuffer();
  const fileName = file.name;
  const fileSize = data.byteLength;

  const indices = await vacantIndices();
  const account = await getAccount(pk);

  let fileIndex = indices.vacantFileIndex;
  const segmentedData = encodeFile(new Uint8Array(data));
  const segments = segmentedData.map((segmentData) => {
    const elements = bufferToFrElements(segmentData).map((x) => x.toString());
    const hash = BigInt(poseidon2_bn256_hash(elements));
    const [tx, signature] = prep_file_tx(DEFAULT_FILE_LIFETIME, Number(account.index), fileIndex++, hash, skBuf.toString('hex'), BigInt(account.account.nonce))

    return { tx, signature, data: Buffer.from(segmentData) };
  });

  await client.upload({ segments, fileMetadata: { size: fileSize, path: fileName } });

  return {
    indices: [...Array(segments.length)].map((_, i) => BigInt(i) + BigInt(indices.vacantFileIndex)),
    metadata: { size: fileSize, path: fileName },
  };
}

export async function faucet(): Promise<{ index: number, account: AccountData }> {
  return await client.faucet(pk);
}

export async function vacantIndices(): Promise<VacantIndicesResponse> {
  return await client.vacantIndices();
}

export async function getAccount(publicKey: bigint): Promise<{ index: number, account: AccountData }> {
  return client.account(publicKey);
}

export async function getLatestBlocks(): Promise<Block[]> {
  return await client.blocks();
}

export async function listFiles(): Promise<GatewayMeta[]> {
  return await client.listFiles(pk);
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
