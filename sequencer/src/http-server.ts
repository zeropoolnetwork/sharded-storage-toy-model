import express, { Express, Request, Response } from 'express';
import http from 'node:http';
import cors from 'cors';
import { FileTx, SignaturePacked } from 'zpst-crypto-sdk/src/noir_codegen';
import mime from 'mime';
import { fileTypeFromBuffer } from 'file-type';

import { FileData, FileMetadata, GatewayMeta, appState } from './state';
import { prep_account_tx } from 'zpst-crypto-sdk/src/util';
import { FAUCET_AMOUNT, MASTER_SK } from './env';
import { getSegment } from './nodes';
import { decodeFile } from 'zpst-common/src/codec';
import { Account } from 'zpst-crypto-sdk';

export const app: Express = express();
export const server = new http.Server(app);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.raw({ type: '*/*' }));
app.use(cors());

interface FileRequest {
  segemnts: {
    tx: FileTx;
    signature: SignaturePacked;
    data: FileData;
  }[];
  metadata: FileMetadata;
}

// Upload a file
app.post('/files', async (req: Request, res: Response) => {
  const file: FileRequest = req.body;

  for (const seg of file.segemnts) {
    await appState.addFileTransaction(seg.tx, seg.signature, seg.data);
  }
});

// List all files for a given owner
app.get('/files/:owner', async (req: Request, res: Response) => {
  try {
    const owner = BigInt(req.params.owner);
    let metas: GatewayMeta[] = [];
    metas = await appState.fileMetadata.get(owner);
    res.send(metas);
  } catch (e) {
    res.status(404).send({ error: e });
  }
});

// Get a file by owner and path
// Fetches needed segments from the storage nodes, assembles them into a file and returns it.
app.get('/files/:owner/*', async (req: Request, res: Response) => {
  let meta: GatewayMeta;
  try {
    const owner = BigInt(req.params.owner);
    const fullPath = req.params[0];
    const metas = await appState.fileMetadata.get(owner);
    const m = metas.find((m) => m.filePath === fullPath); // TODO: Get rid of linear search
    if (m) {
      meta = m;
    } else {
      throw new Error('File not found');
    }
  } catch (e) {
    res.status(404).send({ error: e });
    return;
  }

  let segments: Buffer[] = await Promise.all(meta.fileIndices.map(async (index) => {
    return getSegment(index);
  }));

  try {
    const file = decodeFile(segments, meta.fileSize);
    const contentType = mime.getType(meta.filePath) || (await fileTypeFromBuffer(file))?.mime || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.send(meta);
  } catch (e) {
    res.status(500).send({ error: e });
  }
});

// TODO: Implement a proper optimistic state with rollback.
// FIXME: quick and dirty temporary fix, since the main state doesn't update quick enough.
let masterNonce = 0n;
app.post('/faucet', async (req: Request, res: Response) => {
  const pk = BigInt(req.body.pk);
  let account: Account;
  let accIndex: number;

  const r = await appState.getAccountByPk(pk);
  if (r) {
    account = r[1];
    account.balance += FAUCET_AMOUNT;
    accIndex = r[0];
  } else {
    account = new Account();
    account.key = pk;
    account.balance = FAUCET_AMOUNT;
    accIndex = appState.getVacantAccountIndex();
  }

  const masterAccount = appState.state.accounts.readLeaf(0)[1];
  let nonce;
  if (masterAccount.nonce > masterNonce) {
    masterNonce = masterAccount.nonce;
    nonce = masterNonce;
  } else {
    nonce = masterNonce++;
  }

  const [acc, signature] = prep_account_tx(FAUCET_AMOUNT, 0, accIndex, MASTER_SK, pk, nonce);
  await appState.addAccountTransaction(acc, signature);
  res.send({ index: accIndex, account });
});

app.get('/accounts/:id', async (req: Request, res: Response) => {
  const acc = await appState.getAccountByPk(BigInt(req.params.id));
  if (acc) {
    console.log('Requested account data:', acc);
    res.send({
      index: acc[0],
      account: acc[1],
    });
  } else {
    res.status(404).send({ error: 'Account not found' });
  }
});

app.get('/blocks', async (req: Request, res: Response) => {
  const b = await appState.blocks.getNLatestBlocks(3);
  res.send(b);
});

app.get('/vacant-indices', async (req: Request, res: Response) => {
  const vacantAccountIndex = appState.getVacantAccountIndex();
  const vacantFileIndex = appState.getVacantFileIndex();

  res.send({
    vacantAccountIndex,
    vacantFileIndex,
  });
});

app.get('/status', async (req: Request, res: Response) => {
  res.send({ status: 'OK', blockInProgress: appState.blockInProgress });
});
