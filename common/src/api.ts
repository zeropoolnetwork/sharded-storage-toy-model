export type Field = string;

export interface VacantIndicesResponse {
  vacantFileIndex: number,
  vacantAccountIndex: number,
}

export interface AccountData {
  key: Field;
  balance: Field;
  nonce: Field;
  random_oracle_nonce: Field;
}

export interface SignaturePacked {
  a: Field;
  s: Field;
  r8: Field;
}

export interface FileTx {
  sender_index: Field;
  data_index: Field;
  time_interval: Field;
  data: Field;
  nonce: Field;
}

export interface FullFileMeta {
  fileHash: Field;
  filePath: string;
  fileIndices: Field[];
  fileSize: number;
}

export interface FileMetadata {
  hash: bigint;
  path: string;
  size: number;
}

export interface SegmentRequest {
  tx: FileTx;
  signature: SignaturePacked;
  data: string;
  order: number
}

/** Contains file split into segments of field values */
export interface FileRequest {
  segments: SegmentRequest[],
  fileMetadata: FileMetadata,
}

export interface Block {
  oldRoot: string;
  newRoot: string;
  /** Transaction hash of the published block */
  txHash: string;
  /**  Block height on the rollup */
  height: number;
  /** Block height on the blockchain */
  now: number;
}

export interface AccountTx {
  sender_index: Field;
  receiver_index: Field;
  receiver_key: Field;
  amount: Field;
  nonce: Field;
};

/** HTTP client for the sequencer public REST API */
export class SequencerClient {
  constructor(private url: string) { }

  async upload(request: FileRequest): Promise<void> {
    await post(`${this.url}/files`, request);
  }

  async getFiles(owner: bigint): Promise<FullFileMeta[]> {
    return await get(`${this.url}/files/${owner}`);
  }

  async getFile(owner: bigint, path: string): Promise<Buffer> {
    return Buffer.from(await (await fetch(`${this.url}/files/${owner}/${path}`)).arrayBuffer());
  }

  async getAccount(pk: bigint): Promise<{ index: number, account: AccountData }> {
    return await get(`${this.url}/accounts/${pk}`);
  }

  async faucet(pk: bigint): Promise<{ index: number, account: AccountData }> {
    return await post(`${this.url}/faucet`, { pk });
  }

  async getVacantIndices(): Promise<VacantIndicesResponse> {
    return await get(`${this.url}/vacant-indices`);
  }

  async getVacantFileIndices(num: number): Promise<number[]> {
    return await get(`${this.url}/vacant-file-indices?count=${num}`);
  }

  async getLatestBlocks(): Promise<Block[]> {
    return await get(`${this.url}/blocks`);
  }

  async testConnection(): Promise<boolean> {
    try {
      let res: { status: string } = await get(`${this.url}/status`);
      return res.status == 'OK';
    } catch (err) {
      console.error('Error connecting to sequencer:', err);
      return false;
    }
  }
}

/** HTTP client for the storage node public REST API */
export class StorageNodeClient {
  constructor(private url: string) { }

  async getSegment(segmentId: string): Promise<Buffer> {
    return Buffer.from(await (await fetch(`${this.url}/segment/${segmentId}`)).arrayBuffer());
  }
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.statusText}.`);
  }
  return await res.json();
}

async function post<T>(url: string, body: any): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to post ${url}: ${res.statusText}`);
  }

  return await res.json();
}
