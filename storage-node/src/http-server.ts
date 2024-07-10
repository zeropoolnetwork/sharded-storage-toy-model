import express, { Express, Request, Response } from 'express';
import cors from 'cors';

import { Tree } from 'zpst-crypto-sdk/src/merkle-tree';
import { appState } from './state';
import { PORT } from './env';

export async function startHttpServer(port: number) {
  const app: Express = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.raw({ type: '*/*' }));
  app.use(cors());

  app.get('/segment/:id', async (req: Request, res: Response) => {
    const data = await appState.storage.read(req.params.id);

    if (!data) {
      res.status(404).send('Segment not found');
      return;
    }

    const tree: Tree<bigint> = new Tree(0, [], [0n], (v) => v);
    tree.fromBuffer(data, () => 0n);
    const bytes = tree.values
      .map((v) => v.toString(16).padStart(64, '0'))
      .join('');
    const buf = Buffer.from(bytes, 'hex');

    res.setHeader('Content-Type', 'application/octet-stream');

    res.send(buf);
  });

  app.get('/segments/:ids', async (req: Request, res: Response) => {
    const ids = req.params.ids.split(',');

    if (ids.length > 1000) {
      res.status(400).send('Too many segments');
      return;
    }

    const trees = await Promise.all(ids.map(async (id) => (await appState.storage.read(id))!));
    for (const seg of trees) {
      if (!seg) {
        res.status(404).send('Segment not found');
        return;
      }
    }

    const data = trees.map(data => {
      const tree: Tree<bigint> = new Tree(0, [], [0n], (v) => v);
      tree.fromBuffer(data, () => 0n);
      const bytes = tree.values
        .map((v) => v.toString(16).padStart(64, '0'))
        .join('');
      return Buffer.from(bytes, 'hex');
    });

    const buf = Buffer.concat(data);

    res.setHeader('Content-Type', 'application/octet-stream');

    res.send(buf);
  });

  app.get('/status', async (req: Request, res: Response) => {
    res.send({ status: 'OK' });
  });

  app.listen(PORT || port, () => {
    console.log('Listening on port', port);
  });
}
