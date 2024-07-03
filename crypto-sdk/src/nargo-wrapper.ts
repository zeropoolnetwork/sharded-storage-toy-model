import { exec } from 'node:child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { promisify } from 'node:util';

import { stringify } from 'smol-toml';

import { RandomOracle, Field, RollupInput, RollupPubInput, Root, } from './noir_codegen';

const execAsync = promisify(exec);

export type Proof = Uint8Array;

export type ProverToml = {
  pubhash: Field,
  input: RollupInput,
};

export type VerifierToml = {
  pubhash: Field,
}

export async function prove(nargo_project_path: string, inputs: ProverToml): Promise<Proof> {
  const tempDirPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sharded-storage-prover-'));
  const tempFilePath = path.join(tempDirPath, 'Prover.toml');

  try {
    await fs.cp(nargo_project_path, path.join(tempDirPath, "circuits"), { recursive: true });
    await fs.writeFile(tempFilePath, stringify(inputs));
    const out = await execAsync(`
       set -xefu
       cd "${tempDirPath}/circuits"
       nargo execute --prover-name "${tempFilePath}" defwitness
       bb prove -b ./target/circuits.json -w ./target/defwitness.gz -o ./proof
    `, { encoding: 'utf8' });
    const buf = await fs.readFile(path.join(tempDirPath, "circuits", "proof"));
    return new Uint8Array(buf);
  } catch (e) {
    throw e;
  } finally {
    await execAsync(`
      set -xefu
      rm -r ${tempDirPath}
    `);
  }
}

export async function verify(nargo_project_path: string, inputs: VerifierToml, proof: Proof): Promise<boolean> {
  const tempDirPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sharded-storage-verifier-'));
  const tempFilePath = path.join(tempDirPath, 'Verifier.toml');

  try {
    await fs.cp(nargo_project_path, path.join(tempDirPath, "circuits"), { recursive: true });
    await fs.writeFile(tempFilePath, stringify(inputs));
    await fs.writeFile(path.join(tempDirPath, "circuits", "proof"), proof);
    try {
      await execAsync(`
         set -xefu
         cd "${tempDirPath}/circuits"
         bb verify -k ./target/vk -p ./proof
      `, { encoding: 'utf8' });
      return true;
    } catch (e) {
      // console.log(`verification failed`);
      // console.log(e);
      return false;
    }
  } catch (e) {
    throw e;
  } finally {
    await execAsync(`
      set -xefu
      rm -r ${tempDirPath}
    `);
  }
}
