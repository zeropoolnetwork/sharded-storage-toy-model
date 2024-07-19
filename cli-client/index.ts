import { program } from 'commander';
import fs from 'fs';
import path from 'path';
import { bufferToFrElements, encodeFile, encodeSegment } from 'zpst-common/src/codec';
import { merkle_tree, poseidon2_bn256_hash } from 'zpst-poseidon2-bn256';
import { type FileMetadata, FileTx, SequencerClient, SignaturePacked } from 'zpst-common/src/api';
import { derivePublicKey, deriveSecretScalar, signMessage } from '@zk-kit/eddsa-poseidon';
import ora from 'ora';

// TODO: Share code between the CLI and the frontend

program.command('faucet')
  .requiredOption('-s, --sk <sk>', 'Secret key')
  .requiredOption('-u, --url <url>', 'Sequencer URL')
  .action(async (_, options) => {
    const sk = deriveSecretScalar(options.sk);
    const pk = derivePublicKey(sk.toString())[0];
    const client = new SequencerClient(options.url);

    const spinner = ora('Requesting faucet').start();
    const res = await client.faucet(pk);
    spinner.succeed();
    console.log('Faucet response:', res);
  });

program.command('upload-dir')
  .argument('<dir>', 'Directory to upload')
  .requiredOption('-s, --sk <sk>', 'Secret key')
  .requiredOption('-u, --url <url>', 'Sequencer URL')
  .option('-d, --dry-run', 'Dry run', true)
  .option('-p, --prefix <prefix>', 'Prefix for keys', '')
  .action(async (dir: string, options: any) => {
    const sk = deriveSecretScalar(options.sk);
    const pk = derivePublicKey(sk.toString())[0];
    const files = scanDir(dir);

    for (const [key, value] of files) {
      console.log(`${options.prefix}${key} (${value.length} bytes)`);
    }

    if (options.dryRun) {
      return;
    }

    // handle re-uploads
    let indices: { [name: string]: number[] };
    try {
      indices = JSON.parse(fs.readFileSync('indices.json', 'utf8')) as any;
    } catch (e) {
      indices = {};
    }

    for (const [path, data] of files) {
      const spinner = ora(`Uploading ${path}`).start();
      const res = await uploadFile(path, data, new SequencerClient(options.url), sk, pk, indices[path]);
      spinner.succeed();
      console.log('Uploaded', res.metadata.path, 'with indices', res.indices);
      indices[path] = res.indices.map((x) => Number(x));
    }

    const indicesData = JSON.stringify(indices, null, 2);
    fs.writeFileSync('indices.json', indicesData);
  });

// TODO: Return an iterator instead of an array
function scanDir(dir: string): [string, Buffer][] {
  const absolutePath = path.resolve(dir);
  const results: [string, Buffer][] = [];

  function scan(currentPath: string): void {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      const relativePath = path.relative(absolutePath, fullPath);

      if (entry.isDirectory()) {
        scan(fullPath);
      } else if (entry.isFile()) {
        results.push([relativePath, fs.readFileSync(fullPath)]);
      }
    }
  }

  scan(absolutePath);

  return results;
}

const DEFAULT_FILE_LIFETIME = 7149n * 300n; // about 300 days

export interface UploadFileResult {
  indices: bigint[];
  metadata: FileMetadata;
}

export async function uploadFile(
  path: string,
  data: Buffer,
  client: SequencerClient,
  sk: bigint,
  pk: bigint,
  existingIndices?: number[],
): Promise<UploadFileResult> {
  const fileSize = data.byteLength;

  const account = await client.getAccount(pk);
  if (!account) {
    throw new Error('Cannot upload: account not found');
  }

  console.log('Received account ', account);

  const fullFileEncoded = encodeSegment(data);
  const fullFileHash = BigInt(poseidon2_bn256_hash(bufferToFrElements(fullFileEncoded).map((x) => x.toBigInt().toString())));
  const segmentedData = encodeFile(data);
  const indices = existingIndices || await client.getVacantFileIndices(segmentedData.length);

  const storageFee = 1n; // FIXME: hardcoded
  const totalFee = storageFee * DEFAULT_FILE_LIFETIME * BigInt(segmentedData.length);

  if (BigInt(account.account.balance) < totalFee) {
    throw new Error(`Not enough funds to upload the file, required: ${totalFee}, available: ${account.account.balance}`);
  }

  let nonce = BigInt(account.account.nonce);
  const segments = segmentedData.map((segmentData, index) => {
    console.log(`Preparing segment ${index}...`);
    const elements = bufferToFrElements(segmentData).map((x) => x.toBigInt().toString());

    console.log('Building merkle tree...')
    const depth = 10; // FIXME: hardcoded
    const tree = merkle_tree(depth, elements, '0');
    const root = tree[1];

    const accNonce = nonce + BigInt(index);

    console.log('nonce', accNonce);

    const fileIndex = indices[index];
    const [tx, signature] = prep_file_tx(
      DEFAULT_FILE_LIFETIME,
      Number(account.index),
      fileIndex,
      BigInt(root),
      sk.toString(),
      accNonce,
    );

    return { tx, signature, data: Buffer.from(segmentData).toString('base64'), order: index };
  });

  console.log(`Uploading ${segments.length} segment(s), `, ' file size:', fileSize, ', file name:', path, ', file hash:', fullFileHash);
  await client.upload({ segments, fileMetadata: { size: fileSize, path, hash: fullFileHash } });

  console.log('Upload complete');

  return {
    indices: indices.map((x) => BigInt(x)),
    metadata: { size: fileSize, path, hash: fullFileHash },
  };
}

/// Same as prep_account_tx, but for file transactions.
export function prep_file_tx(
  time_interval: bigint,
  /// Sender leaf indices in accounts merkle tree and file index in files merkle tree
  sender_index: number,
  data_index: number,
  /// Contents hash
  data: bigint,
  /// Sender key, using zk-kit/eddsa-poseidon format (pk packed into x coordinate)
  sender_sk: string,
  /// Sender account's nonce. Increases by 1 with each transaction from sender
  nonce: bigint,
): [FileTx, SignaturePacked] {
  const tx: FileTx = {
    sender_index: sender_index.toString(),
    data_index: data_index.toString(),
    time_interval: time_interval.toString(),
    data: data.toString(),
    nonce: nonce.toString(),
  };

  const m = poseidon2_bn256_hash(
    [tx.sender_index, tx.data_index, tx.time_interval, tx.data, tx.nonce]
  );
  const sigma = signMessage(sender_sk, m);
  const sign: SignaturePacked = {
    a: derivePublicKey(sender_sk)[0].toString(),
    s: sigma.S.toString(),
    r8: sigma.R8[0].toString(),
  };

  return [tx, sign];
}

program.parse();