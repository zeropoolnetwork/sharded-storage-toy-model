export interface Account {
  id: string,
  owner: string,
  balance: bigint,
}

export interface DataEntry {
  timestamp: number,
  owner: string,
  hash: string,
}

export interface Block {
  index: number;
  timestamp: string;
  previousHash: string;
  hash: string;
  // nonce: number;
}
