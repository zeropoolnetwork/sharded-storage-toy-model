import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { stringify } from 'smol-toml';

import { RandomOracle, Field, RollupInput, RollupPubInput, Root, circuits, circuits_circuit } from './noir_codegen';

export type ProverToml = {
  pubhash: Field,
  input: RollupInput,
};

export type VerifierToml = {
  pubhash: Field,
}

export function prove(nargo_project_path: string, inputs: ProverToml): string {
  const tempDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'sharded-storage-prover-'));
  const tempFilePath = path.join(tempDirPath, 'Prover.toml');

  try {
    fs.cpSync(nargo_project_path, path.join(tempDirPath, "circuits"), {recursive: true});
    fs.writeFileSync(tempFilePath, stringify(inputs));
    const out = execSync(`
       set -xefu
       cd "${tempDirPath}/circuits"
       nargo prove --prover-name "${tempFilePath}"
   `, { encoding: 'utf8' });
    return fs.readFileSync(
      path.join(tempDirPath, "circuits", "proofs", "circuits.proof"),
      { encoding: 'utf-8' }
    );
  } catch (e) {
    throw e;
  } finally {
    execSync(`
      set -xefu
      rm -r ${tempDirPath}
    `);
  }
}

export function verify(nargo_project_path: string, inputs: VerifierToml, proof: string): Boolean {
  const tempDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'sharded-storage-verifier-'));
  const tempFilePath = path.join(tempDirPath, 'Verifier.toml');

  try {
    fs.cpSync(nargo_project_path, path.join(tempDirPath, "circuits"), {recursive: true});
    fs.writeFileSync(tempFilePath, stringify(inputs));
    try {
      fs.mkdirSync(path.join(tempDirPath, "circuits", "proofs"));
    } catch (_) {}
    fs.writeFileSync(path.join(tempDirPath, "circuits", "proofs", "circuits.proof"), proof);
    try {
      execSync(`
         set -xefu
         cd "${tempDirPath}/circuits"
         nargo verify --verifier-name "${tempFilePath}"
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
    execSync(`
      set -xefu
      rm -r ${tempDirPath}
    `);
  }
}
