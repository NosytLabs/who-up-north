import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const workflow = readFileSync(new URL('../../.github/workflows/pages.yml', import.meta.url), 'utf8');
const guardStep = workflow.split('      - name: Check Pages configuration\n')[1]?.split('\n      - name:')[0];
assert.ok(guardStep, 'Pages configuration guard exists');
const script = guardStep.split('        run: |\n')[1]?.split('\n').map(line => line.replace(/^          /, '')).join('\n');
assert.ok(script, 'Pages configuration guard has a runnable Bash body');

// Execute the production Bash, replacing only curl so tests never use the network.
function runGuard(status, body = '{}', exitCode = 0) {
  const dir = mkdtempSync(join(tmpdir(), 'pages-guard-'));
  const output = join(dir, 'output');
  try {
    writeFileSync(output, '');
    const curl = join(dir, 'curl');
    writeFileSync(curl, `#!/usr/bin/env node\nconst fs = require('node:fs');\nconst args = process.argv.slice(2);\nconst i = args.indexOf('-o');\nif (i < 0) process.exit(2);\nfs.writeFileSync(args[i + 1], process.env.MOCK_BODY);\nprocess.stdout.write(process.env.MOCK_STATUS);\nprocess.exit(Number(process.env.MOCK_EXIT));\n`);
    chmodSync(curl, 0o755);
    const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script], {
      cwd: fileURLToPath(new URL('../..', import.meta.url)),
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, GH_TOKEN: 'test-token',
        GITHUB_REPOSITORY: 'NosytLabs/who-up-north', GITHUB_OUTPUT: output,
        GITHUB_STEP_SUMMARY: join(dir, 'summary'), MOCK_STATUS: String(status),
        MOCK_BODY: body, MOCK_EXIT: String(exitCode) },
      encoding: 'utf8', timeout: 5000,
    });
    assert.ifError(result.error);
    return { ...result, output: readFileSync(output, 'utf8') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('a configured Actions Pages site passes', () => {
  const result = runGuard(200, JSON.stringify({ build_type: 'workflow' }));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.output, /^enabled=true$/m);
});

for (const [name, status, body, diagnostic] of [
  ['missing Pages site', 404, '{}', /Settings.*Pages/],
  ['authentication failure', 401, '{}', /permission|authentication/i],
  ['permission failure', 403, '{}', /permission|access/i],
  ['rate limit', 429, '{}', /429|rate/i],
  ['GitHub server failure', 500, '{}', /500|HTTP/i],
  ['legacy branch deployment', 200, '{"build_type":"legacy"}', /GitHub Actions/],
  ['malformed success response', 200, 'not JSON', /configuration|response/i],
]) {
  test(`${name} fails instead of reporting a successful deployment`, () => {
    const result = runGuard(status, body);
    assert.notEqual(result.status, 0, 'Deployment configuration errors must not be green');
    assert.doesNotMatch(result.output, /^enabled=true$/m);
    assert.match(result.stdout + result.stderr, diagnostic);
  });
}

test('network failure is fatal and does not enable deployment', () => {
  const result = runGuard('000', '{}', 7);
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.output, /^enabled=true$/m);
});

test('the built artifact is uploaded before Pages configuration is checked', () => {
  const uploadAt = workflow.indexOf('      - name: Upload Pages artifact');
  const guardAt = workflow.indexOf('      - name: Check Pages configuration');
  assert.ok(uploadAt >= 0 && uploadAt < guardAt, 'Keep the successful build available even when deployment is blocked');
  const uploadStep = workflow.slice(uploadAt).split('\n      - name:')[0];
  assert.doesNotMatch(uploadStep, /^\s+if:/m, 'Artifact retention must not depend on Pages being enabled');
});
