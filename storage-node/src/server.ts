import { program } from 'commander';
import io from 'socket.io-client';
import { AccountData, init, storage, updateAccountData } from './state';

import { UploadAndMineResponse, mineSegment, uploadSegments } from './handlers';
import { MiningResult } from 'zpst-crypto-sdk/lib/mining';
import { startHttpServer } from './http-server';
import { SEQUENCER_URL } from './env';

async function main() {
  await init();

  program
    .option('-p, --port <port>', 'Port to listen on', '3001');

  program.parse();
  const options = program.opts();

  await startHttpServer(options.port);

  console.log('Connecting to master node:', SEQUENCER_URL);
  const socket = io(SEQUENCER_URL, { autoConnect: true });

  socket.on('connect', () => {
    console.log('Connected to master node');


    socket.emit('register', '0x' + BigInt(0).toString(16), (res: AccountData | undefined) => {
      if (res) {
        console.log('Account data:', res);
        updateAccountData(res);
      } else {
        console.error('Account not found');
      }
    });
  });

  socket.on('disconnect', () => {
    console.log('Disconnected from master node');
  });

  socket.on('error', (err: unknown) => {
    console.error('Socket error:', err);
  });

  socket.on('upload', async (segments: { id: string, data: Buffer }[], cb: (res: { error: string } | { success: boolean }) => void) => {
    try {
      console.log('Uploading segments:', segments);

      for (const seg of segments) {
        await storage.write(seg.id, seg.data);
      }

      cb({ success: true });
    } catch (err) {
      console.error('Mining error:', err);
      cb({ error: String(err) });
    }
  });

  socket.on('uploadAndMine', async (segments: { id: string, data: Buffer }[], roValues: bigint[], roOffset: bigint, cb: (res: UploadAndMineResponse | { error: string }) => void) => {
    try {
      console.log('Uploading segments:', segments);

      for (const seg of segments) {
        await storage.write(seg.id, seg.data);
      }

      const res = await mineSegment(roValues, roOffset);
      cb(res);
    } catch (err) {
      console.error('Mining error:', err);
      cb({ error: String(err) });
    }
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
