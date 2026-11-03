import { readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
const group = process.argv[2];
if (!['backend','integration'].includes(group)) throw new Error('Unknown test group');
const directory = resolve('tests', group);
function filesIn(path) {
  return readdirSync(path,{withFileTypes:true}).flatMap(e => e.isDirectory() ? filesIn(join(path,e.name)) : e.name.endsWith('.test.ts') ? [join(path,e.name)] : []);
}
const files = filesIn(directory).sort();
if (!files.length) throw new Error(`No tests found in ${directory}; refusing a zero-test success.`);
const result = spawnSync(process.execPath, ['--import','tsx','--test','--test-concurrency=1',...files], { stdio:'inherit', env:process.env });
process.exit(result.status ?? 1);
