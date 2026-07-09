import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env.local');
const raw = readFileSync(envPath, 'utf8');

const vars = {};
for (const line of raw.split(/\r?\n/)) {
  if (!line || line.startsWith('#')) continue;
  const i = line.indexOf('=');
  if (i < 1) continue;
  const key = line.slice(0, i).trim();
  let val = line.slice(i + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  if (key.startsWith('VERCEL_')) continue;
  if (!val) continue;
  vars[key] = val.replace(/\\n/g, '\n');
}

const KEYS = [
  'GOOGLE_SERVICE_ACCOUNT_EMAIL',
  'GOOGLE_PRIVATE_KEY',
  'GOOGLE_SHEET_ID',
  'GOOGLE_DRIVE_FOLDER_ID',
  'ADMIN_PIN',
];
const ENVS = ['production', 'preview', 'development'];

function run(cmd, input) {
  execSync(cmd, {
    cwd: root,
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
}

for (const key of KEYS) {
  if (!vars[key]) {
    console.warn(`skip missing local ${key}`);
    continue;
  }
  for (const env of ENVS) {
    try {
      run(`npx vercel env rm ${key} ${env} --yes`, '');
    } catch {
      /* not present */
    }
    console.log(`add ${key} -> ${env}`);
    run(`npx vercel env add ${key} ${env}`, vars[key]);
  }
}

console.log('done');
