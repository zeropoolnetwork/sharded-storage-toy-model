import { Socket, Server as SocketIOServer } from 'socket.io';
import { server } from './http-server';
import { MerkleProof } from 'zpst-crypto-sdk/src/merkle-tree';
import { MiningResult } from 'zpst-crypto-sdk/src/mining';
import { MiningTx, SignaturePacked } from 'zpst-crypto-sdk/src/noir_codegen';
import { AccountData, appState } from './state';

const io = new SocketIOServer(server);
const nodes = new Map<string, Socket>();

io.on('connection', (socket) => {
  console.log('New node connected', socket.id);

  socket.on('register', async (pk: string, cb) => {
    nodes.set(socket.id, socket);

    let res: AccountData | undefined = undefined;
    try {
      res = await appState.accounts.get(pk);
    } catch (err) {
      console.error('Account not found:', pk);
    }

    cb(res);

    console.log('Node registered:', socket.id, pk);
  });

  socket.on('disconnect', () => {
    nodes.delete(socket.id);
    console.log('Node disconnected');
  });

  socket.on('error', (err) => {
    console.error('Socket error:', err);
  });
});

export interface UploadAndMineResponse {
  miningRes: MiningResult,
  word: [MerkleProof, bigint],
  tx: [MiningTx, SignaturePacked],
}

export async function uploadAndMine(segments: { id: string, data: Buffer }[], roValues: bigint[], roOffset: bigint): Promise<UploadAndMineResponse> {
  const res: UploadAndMineResponse = await new Promise((resolve, reject) => {
    for (const [id, socket] of nodes) {
      console.log('Sending uploadAndMine to', id);

      socket.emit('uploadAndMine', segments, roValues, roOffset, (res: UploadAndMineResponse | { error: string }) => {
        if (res.hasOwnProperty('error')) {
          reject((res as { error: string }).error);
        } else {
          resolve(res as UploadAndMineResponse);
        }
      });
    }
  });

  return res;
}

