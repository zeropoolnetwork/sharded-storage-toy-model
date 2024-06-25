import express, { Express, Request, Response } from 'express';
import http from 'node:http';
import cors from 'cors';

import { FileData, FileMetadata, appState } from './state';
import { FileTx, SignaturePacked } from 'zpst-crypto-sdk/src/noir_codegen';

export const app: Express = express();
export const server = new http.Server(app);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.raw({ type: '*/*' }));
app.use(cors())

interface FileRequest {
  segemnts: {
    tx: FileTx;
    signature: SignaturePacked;
    data: FileData;
  }[];
  metadata: FileMetadata;
}

app.post('/files', async (req: Request, res: Response) => {
  console.log('Uploading file:', req.body.metadata);

  const file: FileRequest = req.body;

  for (const seg of file.segemnts) {
    await appState.addFileTransaction(seg.tx, seg.signature, seg.data);
  }
});

app.post('/faucet', async (req: Request, res: Response) => {
  await appState.addAccountTransaction(req.body.account, req.body.signature);
});

app.get('/accounts/:id', async (req: Request, res: Response) => {
  try {
    const acc = await appState.accounts.get(req.params.id);
    res.send(acc);
  } catch (err) {
    res.status(404).send({ error: 'Account not found' });
  }
});

app.get('/blocks', async (req: Request, res: Response) => {
  const b = await appState.blocks.getNLatestBlocks(3);
  res.send(b);
});

app.get('/vacant-indices', async (req: Request, res: Response) => {
  const indices = await appState.getVacantIndices();

  res.send(indices);
});

app.get('/status', async (req: Request, res: Response) => {
  res.send({ status: 'OK' });
});
