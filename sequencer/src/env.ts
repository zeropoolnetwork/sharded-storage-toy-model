export const OPERATOR_SK: string = required('OPERATOR_SK', str);
export const RPC_URL: string = required('RPC_URL', str);
export const MASTER_SK: string = required('MASTER_SK', str);
export const ROLLUP_CONTRACT_ADDRESS: string = required('ROLLUP_CONTRACT_ADDRESS', str);
export const BLOCK_TIME_INTERVAL: number = parseInt(process.env.BLOCK_TIME_INTERVAL || '10000');
export const GENESIS_BALANCE: bigint = BigInt(process.env.GENESIS_BALANCE || 10n ** 50n);
export const ACCOUNT_TREE_PATH: string = process.env.ACCOUNT_TREE_PATH || './data/account_tree.bin';
export const FILE_TREE_PATH: string = process.env.FILE_TREE_PATH || './data/file_tree.bin';
export const BLOCKS_PATH: string = process.env.BLOCKS_PATH || './data/blocks';
export const ACCOUNTS_PATH: string = process.env.ACCOUNTS_PATH || './data/accounts';
export const FILE_METADATA_PATH: string = process.env.FILE_METADATA_PATH || './data/file_metadata';
export const MOCK_BLOCKCHAIN: boolean = process.env.MOCK_BLOCKCHAIN === 'true';

function required<T = string>(name: string, f: (v: string) => T): T {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return f(value);
}

function str(v: string): string {
  return v;
}

function buffer(v: string): Buffer {
  return Buffer.from(v.replace(/^0x/, ''), 'hex');
}
