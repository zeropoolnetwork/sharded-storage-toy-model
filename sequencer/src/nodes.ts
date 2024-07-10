import { Socket, Server as SocketIOServer } from 'socket.io';
import { server } from './http-server';
import { MerkleProof } from 'zpst-crypto-sdk/src/merkle-tree';
import { MiningResult } from 'zpst-crypto-sdk/src/mining';
import { MiningTx, SignaturePacked } from 'zpst-crypto-sdk/src/noir_codegen';
import { appState } from './state';
import { Account } from 'zpst-crypto-sdk';

// TODO: Wrap in a class

const io = new SocketIOServer(server);
const nodes = new Map<string, Socket>();

io.on('connection', (socket) => {
  console.log('New node connected', socket.id);

  socket.on('register', async (pk: string, cb) => {
    nodes.set(socket.id, socket);

    const res = await appState.getAccountByPk(BigInt(pk));
    if (!res) {
      console.error('Storage node\'s requested account not found:', pk);
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
  miningRes: MiningResult;
  word: [MerkleProof, bigint];
  tx: [MiningTx, SignaturePacked];
}

// export async function uploadAndMine(
//   segments: { id: string; data: Buffer }[],
//   roValues: bigint[],
//   roOffset: bigint,
// ): Promise<UploadAndMineResponse> {
//   const res: UploadAndMineResponse = await new Promise((resolve, reject) => {
//     for (const [id, socket] of nodes) {
//       console.log('Sending uploadAndMine to', id);

//       socket.emit(
//         'uploadAndMine',
//         segments,
//         roValues,
//         roOffset,
//         (res: UploadAndMineResponse | { error: string }) => {
//           if (res.hasOwnProperty('error')) {
//             reject((res as { error: string }).error);
//           } else {
//             resolve(res as UploadAndMineResponse);
//           }
//         },
//       );
//     }
//   });

//   return res;
// }

export function isAnyNodeConnected(): boolean {
  return nodes.size > 0;
}

export async function broadcastMiningChallenge(
  roValues: bigint[],
  roOffset: bigint,
): Promise<UploadAndMineResponse> {
  if (nodes.size === 0) {
    throw new Error('No storage nodes connected');
  }

  const res: UploadAndMineResponse = await new Promise((resolve, reject) => {
    for (const [id, socket] of nodes) {
      console.log('Sending mining challenge to', id);

      socket.emit(
        'mine',
        roValues,
        roOffset,
        (res: UploadAndMineResponse | { error: string }) => {
          if (res.hasOwnProperty('error')) {
            reject((res as { error: string }).error);
          } else {
            resolve(res as UploadAndMineResponse);
          }
        },
      );
    }
  });

  return res;
}

export async function upload(
  segments: { id: string; data: Buffer }[],
): Promise<void> {
  if (nodes.size === 0) {
    throw new Error('No storage nodes connected');
  }

  for (const [id, socket] of nodes) {
    console.log('Sending upload to', id);

    await new Promise((resolve, reject) => {
      socket.emit(
        'upload',
        segments,
        (res: { error: string } | { success: boolean }) => {
          if (res.hasOwnProperty('error')) {
            reject((res as { error: string }).error);
          } else {
            resolve(null);
          }
        },
      );
    });
  }
}

export async function getSegment(segmentId: bigint): Promise<Buffer> {
  if (nodes.size === 0) {
    throw new Error('No storage nodes connected');
  }

  // select a random node
  const socket = Array.from(nodes.values())[Math.floor(Math.random() * nodes.size)];

  return await new Promise<Buffer>((resolve, reject) => {
    socket.emit('getSegment', segmentId.toString(), (res: Buffer | { error: string }) => {
      if (res.hasOwnProperty('error')) {
        reject((res as { error: string }).error);
      } else {
        resolve(res as Buffer);
      }
    });
  });
}

export async function getSegments(segmentIds: bigint[]): Promise<Buffer> {
  if (nodes.size === 0) {
    throw new Error('No storage nodes connected');
  }

  // select a random node
  const socket = Array.from(nodes.values())[Math.floor(Math.random() * nodes.size)];

  return await new Promise<Buffer>((resolve, reject) => {
    socket.emit('getSegments', segmentIds.map((x) => x.toString()), (res: Buffer | { error: string }) => {
      if (res.hasOwnProperty('error')) {
        reject((res as { error: string }).error);
      } else {
        resolve(res as Buffer);
      }
    });
  });
}
