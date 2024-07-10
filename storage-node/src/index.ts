import { program } from 'commander';
import io from 'socket.io-client';
import { appState, init } from './state';

import { mineSegment, UploadAndMineResponse } from './handlers';
import { startHttpServer } from './http-server';
import { NODE_PK, SEQUENCER_URL } from './env';
import { AccountData } from 'zpst-common/src/api';
import { defShardedStorageSettings } from 'zpst-crypto-sdk/src/settings';

//@ts-ignore
BigInt.prototype['toJSON'] = function () {
  return this.toString();
}

async function main() {
  program.option('-p, --port <port>', 'Port to listen on', '3001');

  program.parse();
  const options = program.opts();

  await startHttpServer(options.port);

  console.log('Connecting to sequencer:', SEQUENCER_URL);
  const socket = io(SEQUENCER_URL, { autoConnect: true });

  socket.on('connect', () => {
    console.log('Connected to sequencer');

    socket.emit(
      'register',
      NODE_PK,
      async (res: [number, AccountData] | undefined) => {
        if (res) {
          console.log('Account data:', res);
          await init();
        } else {
          console.warn('Account not found. Initializing new one...');
          await init();
          await appState.sequencer.faucet(NODE_PK);
        }
      },
    );
  });

  socket.on('disconnect', () => {
    console.log('Disconnected from sequencer');
  });

  socket.on('error', (err: unknown) => {
    console.error('Socket error:', err);
  });

  socket.on(
    'upload',
    async (
      segments: { id: string; data: Buffer }[],
      cb: (res: { error: string } | { success: boolean }) => void,
    ) => {
      try {
        console.log('Uploading segments:', segments);

        for (const seg of segments) {
          await appState.storage.write(seg.id, seg.data);
        }

        cb({ success: true });
      } catch (err) {
        console.error('Mining error:', err);
        cb({ error: String(err) });
      }
    },
  );

  socket.on(
    'getSegment',
    async (id: string, cb: (res: Buffer | { error: string }) => void) => {
      const data = await appState.storage.read(id);
      if (data) {
        cb(data);
      } else {
        cb({ error: 'Segment not found' });
      }
    },
  );

  socket.on(
    'getSegments',
    async (ids: string[], cb: (res: Buffer | { error: string }) => void) => {
      const trees = await Promise.all(ids.map(async (id) => (await appState.storage.read(id))!));
      for (const seg of trees) {
        if (!seg) {
          cb({ error: 'Segment not found' });
          return;
        }
      }

      const data = trees.map(data => {
        return data.subarray(-1 << defShardedStorageSettings.file_tree_depth)
      });

      const buf = Buffer.concat(data);

      cb(buf);
    },
  )

  socket.on(
    'mine',
    async (
      roValues: bigint[],
      roOffset: bigint,
      cb: (res: UploadAndMineResponse | { error: string }) => void,
    ) => {
      try {
        const res = await mineSegment(roValues, roOffset);
        console.log('Mining result:', res);
        cb(res);
      } catch (err) {
        console.error('Mining error:', err);
        cb({ error: String(err) });
      }
    },
  );

  // socket.on(
  //   'uploadAndMine',
  //   async (
  //     segments: { id: string; data: Buffer }[],
  //     roValues: bigint[],
  //     roOffset: bigint,
  //     cb: (res: UploadAndMineResponse | { error: string }) => void,
  //   ) => {
  //     try {
  //       console.log('Uploading segments:', segments);

  //       for (const seg of segments) {
  //         await storage.write(seg.id, seg.data);
  //       }

  //       const res = await mineSegment(roValues, roOffset);
  //       cb(res);
  //     } catch (err) {
  //       console.error('Mining error:', err);
  //       cb({ error: String(err) });
  //     }
  //   },
  // );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
