import type { Block } from 'zpst-common';

import { PUBLIC_SEQUENCER_API_URL, PUBLIC_NODE_API_URL } from '$env/static/public';
import { prep_account_tx, prep_file_tx, type AccountTx } from './tx';
import { pk, sk } from '$lib';
import { derivePublicKey } from '@zk-kit/eddsa-poseidon';

export const SEQUENCER_API_URL = PUBLIC_SEQUENCER_API_URL || 'http://localhost:3000';
export const NODE_API_URL = PUBLIC_NODE_API_URL || 'http://localhost:3001';

interface FileMetadata {
  ownerId: string;
  size: number;
}

export async function uploadFile(file: File): Promise<string> {
  const data = await file.arrayBuffer();
  const fileName = file.name;
  const dataBase64 = btoa(String.fromCharCode(...new Uint8Array(data))); // FIXME: Serialize and split into multiple txs

  const indices = await vacantIndices();
  const account = await getAccount(pk);

  const hash = BigInt(0); // FIXME
  const [tx, signature] = prep_file_tx(BigInt(7149 * 10), Number(account.index), indices.vacantFileIndex, hash, sk, account.nonce); // FIXME

  const response = await fetch(`${SEQUENCER_API_URL}/files`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ tx, signature, data: { data: dataBase64, metadata: { path: fileName, size: data.byteLength } } })
  });

  const json = await response.json();
  return json.id;
}

export async function faucet(accountId: number, amount: bigint) {
  const [account, signature] = prep_account_tx(amount, 0, accountId, sk, pk, 0n); // FIXME: mainain account state

  const response = await fetch(`${SEQUENCER_API_URL}/faucet`, {
    method: 'POST',
    body: JSON.stringify({ account, signature }),
    headers: {
      'Content-Type': 'application/json',
    },
  });

  return response.json();
}

export async function vacantIndices(): Promise<{ vacantAccountIndex: number, vacantFileIndex: number }> {
  const response = await fetch(`${SEQUENCER_API_URL}/vacant-indices`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  return response.json();
}

export type AccountState = {
  index: bigint;
  balance: bigint;
  nonce: bigint;
  random_oracle_nonce: bigint;
};

export async function getAccount(publicKey: string | bigint): Promise<AccountState> {
  const response = await fetch(`${SEQUENCER_API_URL}/accounts/${publicKey}`);
  return response.json();
}

export async function getLatestBlocks(): Promise<Block[]> {
  const response = await fetch(`${NODE_API_URL}/blocks`);
  return response.json();
}

export async function checkStatus(): Promise<{ rollup: boolean, node: boolean }> {
  let rollup = false;
  try {
    const rollupRes = await fetch(`${SEQUENCER_API_URL}/status`);
    rollup = rollupRes.ok && (await rollupRes.json()).status === 'OK';
  } catch (err) { }

  let node = false;
  try {
    const nodeRes = await fetch(`${NODE_API_URL}/status`);
    node = nodeRes.ok && (await nodeRes.json()).status === 'OK';
  } catch (err) { }

  return { rollup, node };
}
