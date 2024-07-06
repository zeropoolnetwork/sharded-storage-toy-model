import dotenv from 'dotenv';

dotenv.config();

export const OPERATOR_SK: string = required('OPERATOR_SK', str);
export const RPC_URL: string = required('RPC_URL', str);
export const MASTER_SK: string = required('MASTER_SK', str);
export const ROLLUP_CONTRACT_ADDRESS: string = required(
  'ROLLUP_CONTRACT_ADDRESS',
  str,
);
export const BLOCK_TIME_INTERVAL: number = parseInt(
  process.env.BLOCK_TIME_INTERVAL || '30000',
);
export const GENESIS_BALANCE: bigint = BigInt(
  process.env.GENESIS_BALANCE || 10n ** 50n,
);
export const MOCK_BLOCKCHAIN: boolean = process.env.MOCK_BLOCKCHAIN === 'true';
export const MINING_INTERVAL: number = parseInt(process.env.MINING_INTERVAL || '120000');
export const FAUCET_AMOUNT: bigint = BigInt(process.env.FAUCET_AMOUNT || 1_000_000n);

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
