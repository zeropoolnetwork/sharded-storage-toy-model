export interface Account {
  id: string;
  owner: string;
  balance: bigint;
}

export interface Block {
  height: number;
  txHash: string;
}
