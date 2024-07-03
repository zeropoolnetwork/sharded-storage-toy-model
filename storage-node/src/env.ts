import { derivePublicKey } from '@zk-kit/eddsa-poseidon';
import dotenv from 'dotenv';

dotenv.config();

export const PORT: number | undefined = process.env.PORT
  ? parseInt(process.env.PORT)
  : undefined;
export const SEQUENCER_URL: string = process.env.SEQUENCER_URL
  ? process.env.SEQUENCER_URL
  : (() => {
    throw new Error('SEQUENCER_URL is required');
  })();
export const NODE_SK: string = process.env.NODE_SK
  ? process.env.NODE_SK
  : (() => {
    throw new Error('NODE_SK is required');
  })();

export const NODE_PK: bigint = derivePublicKey(NODE_SK)[0];
