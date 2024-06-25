
import express, { Express, Request, Response } from 'express';
import cors from 'cors';

import { Tree } from 'zpst-crypto-sdk/lib/merkle-tree';
import { storage } from './state';
import { PORT } from './env';

export async function startHttpServer(port: number) {
  const app: Express = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.raw({ type: '*/*' }));
  app.use(cors());

  app.get('/segment/:id', async (req: Request, res: Response) => {
    const data = await storage.read(req.params.id);

    if (!data) {
      res.status(404).send('Segment not found');
      return;
    }

    const tree: Tree<bigint> = new Tree(0, [], [0n], (v) => v);
    tree.deserialize(data, () => 0n);
    const bytes = tree.values.map((v) => v.toString(16).padStart(64, '0')).join('');
    const buf = Buffer.from(bytes, 'hex');

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
