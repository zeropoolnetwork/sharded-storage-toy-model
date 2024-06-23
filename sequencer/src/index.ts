
import { program } from 'commander';
import express, { Express, Request, Response } from 'express';
import http from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { Level } from 'level';
import { id } from 'ethers';
import { Blocks, Block } from './blocks';
import { initAppState } from './state';
import { server } from './http-server';

program
  .option('-p, --port <port>', 'Port to listen on', '3000');

program.parse();
const options = program.opts();

async function main() {
  await initAppState();

  server.listen(process.env.PORT || options.port, function () {
    console.log(`Listening on ${options.port}`);
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
