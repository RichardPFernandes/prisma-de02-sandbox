#!/usr/bin/env node
// Verificador STUB da PRI-230 (sandbox). Compara HEAD (merge de teste ou push) com o primeiro pai (base).
'use strict';
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const canon = (v) => Array.isArray(v) ? '[' + v.map(canon).join(',') + ']'
  : (v && typeof v === 'object') ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}'
  : JSON.stringify(v);
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' });
const atBase = (p) => { try { return git('show', `HEAD^1:${p}`); } catch { return null; } };
const errors = [];
const caps = fs.readdirSync('capabilities');
const exists = (p) => fs.existsSync(p);
// Propriedade 3: prefixo do log byte a byte (JCS(array) sem o ']' final) e append só com Decision vigente.
for (const cap of caps) {
  const lp = path.join('capabilities', cap, 'log.json');
  if (!exists(lp)) continue;
  const raw = fs.readFileSync(lp, 'utf8');
  const arr = JSON.parse(raw);
  if (raw !== canon(arr)) errors.push(`${lp}: não está em forma canônica`);
  const oldRaw = atBase(lp);
  const old = oldRaw ? JSON.parse(oldRaw) : [];
  const prefix = canon(old).slice(0, -1);
  if (!raw.startsWith(prefix)) { errors.push(`${lp}: prefixo do log alterado`); continue; }
  for (const e of arr.slice(old.length)) {
    const dp = path.join('decisions', `${e.decision}.json`);
    // Propriedade 2: autoridade atual avaliada na árvore integrada (Decision existe, DECIDED, op_id, não revogada).
    if (!exists(dp)) { errors.push(`${e.op_id}: Decision ${e.decision} inexistente`); continue; }
    const d = JSON.parse(fs.readFileSync(dp, 'utf8'));
    if (d.status !== 'DECIDED') errors.push(`${e.op_id}: Decision ${e.decision} não DECIDED`);
    if (d.op_id !== e.op_id) errors.push(`${e.op_id}: Decision ${e.decision} nomeia outro op_id`);
    if (exists(path.join('decisions', 'revocations', `${e.decision}.json`))) errors.push(`${e.op_id}: Decision ${e.decision} revogada`);
    if (old.some(o => o.op_id === e.op_id)) errors.push(`${e.op_id}: op_id repetido`);
  }
}
// Propriedade 4 (C-2): unicidade de alias no projeto inteiro.
const seen = new Map();
for (const cap of caps) {
  const ap = path.join('capabilities', cap, 'aliases.json');
  if (!exists(ap)) continue;
  for (const a of JSON.parse(fs.readFileSync(ap, 'utf8'))) {
    if (seen.has(a)) errors.push(`AMBIGUOUS_ALIAS ${a}: ${seen.get(a)} e ${cap}`); else seen.set(a, cap);
  }
}
const mode = process.argv[2] || 'pr';
console.log(`mode=${mode} head=${git('rev-parse', 'HEAD').trim()} base=${(() => { try { return git('rev-parse', 'HEAD^1').trim(); } catch { return 'none'; } })()}`);
if (errors.length) {
  if (mode === 'audit') console.log('AUDIT: capability UNKNOWN (estado derivado; operações dependentes bloqueadas)');
  for (const e of errors) console.log('ERRO ' + e);
  process.exit(1);
}
console.log('OK');
