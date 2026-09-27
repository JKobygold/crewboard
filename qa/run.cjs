// The QA loop. One round = static audit + button crawl + goal checks.
// Writes qa/report.md (latest round) and appends to qa/history.jsonl, so every round can be compared
// with the last one; a round that gets worse than the previous best is flagged as a regression.
//   node qa/run.cjs            one round
//   node qa/run.cjs --goals    goal checks only (fast)
'use strict';
const fs = require('fs');
const path = require('path');
const { crawl } = require('./crawl.cjs');
const { runGoals, GOALS } = require('./goals.cjs');

function staticAudit() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const used = new Set([...src.matchAll(/data-action="([a-z0-9-]+)"/g)].map((m) => m[1]));
  const start = src.indexOf('const actions = {'), end = src.indexOf('function deleteNavItem');
  const defined = new Set([...src.slice(start, end).matchAll(/^\s{4}'?([a-z][a-z0-9-]*)'?\(/gm)].map((m) => m[1]));
  const missing = [...used].filter((a) => !defined.has(a));
  return { buttonsInMarkup: used.size, handlers: defined.size, missing };
}


// Server checks: password lock and the health check Railway uses.
async function serverChecks() {
  const { spawn } = require('child_process'); const http = require('http'); const os = require('os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewboard-pw-'));
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: '4399', DATA_DIR: dir, CREWBOARD_PASSWORD: 'test-password', CREWBOARD_TEST: '' }), stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 900));
  const get = (p, auth, method) => new Promise((resolve) => {
    const req = http.request({ host: 'localhost', port: 4399, path: p, method: method || 'GET', headers: auth ? { Authorization: 'Basic ' + Buffer.from(auth).toString('base64') } : {} }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', () => resolve(0)); req.end();
  });
  const checks = [
    ['health check open without password', (await get('/healthz')) === 200],
    ['app locked without password', (await get('/')) === 401],
    ['API locked without password', (await get('/api/state')) === 401],
    ['wrong password refused', (await get('/', 'x:nope')) === 401],
    ['right password (any username) lets you in', (await get('/', 'anyone:test-password')) === 200],
    ['test reset hook is off in production', (await get('/api/__reset', 'a:test-password', 'POST')) === 404],
  ];
  child.kill();
  return checks.map(([name, ok]) => ({ goal: 'Server: ' + name, ok, error: ok ? '' : 'failed' }));
}

(async () => {
  const onlyGoals = process.argv.includes('--goals');
  fs.mkdirSync(path.join(__dirname, 'failures'), { recursive: true });
  const t0 = Date.now();
  const audit = staticAudit();
  console.log(`Static audit: ${audit.buttonsInMarkup} button types, ${audit.missing.length} without a handler ${audit.missing.join(', ')}`);
  let clicks = [];
  if (!onlyGoals) {
    console.log('Button crawl…');
    clicks = await crawl({ onResult: (r) => { if (!r.ok) console.log('  ✗', r.state, '|', r.path, '|', r.issues.join(' ; ')); } });
    console.log(`  ${clicks.filter((c) => c.ok).length}/${clicks.length} clicks OK`);
  }
  console.log('Goal checks…');
  const goals = (await serverChecks()).concat(await runGoals());
  goals.slice(0, 6).forEach((g) => console.log((g.ok ? '✓ ' : '✗ ') + g.goal));
  const round = {
    at: new Date().toISOString(), minutes: +((Date.now() - t0) / 60000).toFixed(1),
    audit, clicksOk: clicks.filter((c) => c.ok).length, clicks: clicks.length,
    goalsMet: goals.filter((g) => g.ok).length, goals: goals.length,
    failures: goals.filter((g) => !g.ok).map((g) => g.goal + ': ' + g.error).concat(clicks.filter((c) => !c.ok).map((c) => c.state + ' | ' + c.path + ' | ' + c.issues.join(' ; '))),
  };
  const histFile = path.join(__dirname, 'history.jsonl');
  const history = fs.existsSync(histFile) ? fs.readFileSync(histFile, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const best = history.reduce((m, h) => Math.max(m, h.goalsMet), 0);
  round.regression = history.length > 0 && round.goalsMet < best;
  fs.appendFileSync(histFile, JSON.stringify(round) + '\n');

  const md = [
    '# Crewboard QA report', '', `Round ${history.length + 1} · ${round.at} · ${round.minutes} min`, '',
    `- Static audit: ${audit.buttonsInMarkup} button types, ${audit.missing.length ? 'missing handlers: ' + audit.missing.join(', ') : 'every button has a handler'}`,
    onlyGoals ? '- Button crawl: skipped (--goals)' : `- Button crawl: ${round.clicksOk}/${round.clicks} clicks OK`,
    `- Goals: ${round.goalsMet}/${round.goals} met${round.regression ? ' — REGRESSION (best so far was ' + best + ')' : ''}`, '',
    '## Goals', '', ...goals.map((g) => `- ${g.ok ? '✅' : '❌'} ${g.goal}${g.ok ? '' : ' — ' + g.error}`), '',
    '## Failures', '', ...(round.failures.length ? round.failures.map((f) => '- ' + f) : ['None.']), '',
    '## History', '', '| Round | When (UTC) | Clicks OK | Goals met | What changed |', '|---|---|---|---|---|',
    ...history.concat([round]).map((h, i) => `| ${i + 1} | ${h.at.slice(0, 16).replace('T', ' ')} | ${h.clicks ? h.clicksOk + '/' + h.clicks : '—'} | ${h.goalsMet}/${h.goals} | ${h.note || ''} |`),
  ].join('\n');
  fs.writeFileSync(path.join(__dirname, 'report.md'), md + '\n');
  console.log(`\nRound done: ${round.goalsMet}/${round.goals} goals, ${round.clicksOk}/${round.clicks} clicks. Report: qa/report.md`);
  process.exit(round.failures.length || audit.missing.length ? 1 : 0);
})();
