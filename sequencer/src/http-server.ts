import express, { Express, Request, Response } from 'express';
import http from 'node:http';
import cors from 'cors';
import mime from 'mime';
import { fileTypeFromBuffer } from 'file-type';
import nocache from 'nocache';
import { rateLimit } from 'express-rate-limit';

import { FullFileMeta, appState } from './state';
import { prep_account_tx } from 'zpst-crypto-sdk/src/util';
import { FAUCET_AMOUNT, MASTER_SK } from './env';
import { getSegment } from './nodes';
import { decodeFile } from 'zpst-common/src/codec';
import { FileRequest } from 'zpst-common/src/api';
import { Account } from 'zpst-crypto-sdk';

export const app: Express = express();
export const server = new http.Server(app);

// TODO: Setup the reverse proxy first
// const fileLimit = rateLimit({
//   windowMs: 1000 * 2,
//   limit: 4,
//   standardHeaders: true,
//   legacyHeaders: false,
// });
//
// const faucetLimit = rateLimit({
//   windowMs: 1000 * 5,
//   limit: 5,
//   standardHeaders: true,
//   legacyHeaders: false,
// });

app.use(express.json({ limit: '10mb' }));
app.use(express.raw({ type: '*/*', limit: '10mb' }));
app.use(cors());
app.use(nocache());
app.set('etag', false);
// app.use(morgan('dev'));
app.use((err: any, req: any, res: any, next: any) => {
  console.error(err.stack);
  res.status(500).send({ error: err });
})

// Upload a file
app.post('/files', /*fileLimit ,*/ async (req: Request, res: Response) => {
  const file: FileRequest = req.body;

  for (const seg of file.segments) {
    appState.addFileTransaction(seg.tx, seg.signature, Buffer.from(seg.data, 'base64'), file.fileMetadata, seg.order);
  }

  res.send({ success: true });
});

// List all files for a given owner
app.get('/files/:owner', async (req: Request, res: Response) => {
  try {
    const owner = BigInt(req.params.owner);
    let metas: FullFileMeta[] = [];
    metas = await appState.fileMetadata.get(owner);
    res.send(metas);
  } catch (e) {
    res.send([]);
  }
});

// Get a file by owner and path
// Fetches needed segments from the storage nodes, assembles them into a file and returns it.
app.get('/files/:owner/:path(*)', async (req: Request, res: Response) => {
  let meta: FullFileMeta;
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

  let segments: { order: number, segmentData: Buffer }[] = await Promise.all(meta.fileIndices.map(async (seg) => {
    return { order: seg.order, segmentData: await getSegment(seg.segmentIndex) };
  }));
  const orderedSegments = segments.sort((a, b) => a.order - b.order).map((s) => s.segmentData);
  const file = decodeFile(orderedSegments, meta.fileSize);
  const contentType = mime.getType(meta.filePath) || (await fileTypeFromBuffer(file))?.mime || 'application/octet-stream';

  res.setHeader('Content-Type', contentType);
  res.send(Buffer.from(file));
});

app.post('/faucet', /*faucetLimit,*/ async (req: Request, res: Response) => {
  const pk = BigInt(req.body.pk);
  let account: Account;
  let accIndex: number;

  const a = await appState.getAccountByPk(pk);
  if (a) {
    account = a.account;
    account.balance += FAUCET_AMOUNT;
    accIndex = a.index;
  } else {
    account = new Account();
    account.key = pk;
    account.balance = FAUCET_AMOUNT;
    accIndex = appState.getVacantAccountIndex();
  }

  const masterAccount = appState.getAccountByIndex(0);
  const [acc, signature] = prep_account_tx(FAUCET_AMOUNT, 0, accIndex, MASTER_SK, pk, masterAccount.nonce);
  appState.addAccountTransaction(acc, signature);
  res.send({ index: accIndex, account });
});

app.get('/accounts/:id', async (req: Request, res: Response) => {
  const acc = await appState.getAccountByPk(BigInt(req.params.id));
  if (acc) {
    res.send(acc);
  } else {
    res.status(404).send({ error: 'Account not found' });
  }
});

app.get('/blocks', async (req: Request, res: Response) => {
  const b = await appState.blocks.getNLatestBlocks(3);
  res.send(b);
});

// TODO: Implement index reservation
app.get('/vacant-indices', async (req: Request, res: Response) => {
  const vacantAccountIndex = appState.getVacantAccountIndex();
  const vacantFileIndex = appState.getVacantFileIndices(1)[0];

  res.send({
    vacantAccountIndex,
    vacantFileIndex,
  });
});

app.get('/vacant-file-indices', async (req: Request, res: Response) => {
  const count = Number(req.query.count || 1);

  if (count < 1) {
    res.status(400).send({ error: 'Invalid count' });
    return;
  }

  if (count > 100) {
    res.status(400).send({ error: 'Count too high' });
    return;
  }

  const indices = appState.getVacantFileIndices(count);
  res.send(indices);
});

app.get('/status', async (req: Request, res: Response) => {
  res.send({
    status: 'OK',
    blockInProgress: appState.blockInProgress,
    currentBlock: appState.blocks.latestBlock.height,
  });
});
