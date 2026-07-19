import fs from 'node:fs';
import { parseSwitchplanWorkbook } from '../lib/migrate/switchplan-parse.ts';
import { parseSwitchplanJbo } from '../lib/migrate/switchplan-jbo-parse.ts';

const DIR = 'C:/dev/jpkerp6-\ub9c8\uc774\uadf8\ub808\uc774\uc158/switchplan_\uc2a4\uc704\uce58\ud50c\ub79c';
const bufBiz = fs.readFileSync(DIR + '/\uc0ac\uc5c5\ud604\ud669.xlsx');
const bufJbo = fs.readFileSync(DIR + '/\uc790\uae08\uc77c\ubcf4.xlsx');
const toAB = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);

const parsed = parseSwitchplanWorkbook(toAB(bufBiz));
const jbo = parseSwitchplanJbo(toAB(bufJbo));

const byKind = {};
let carrySum = 0, carryUnpaidSum = 0;
for (const c of parsed.contracts) {
  const k = String(c._kind || '?');
  byKind[k] = (byKind[k] || 0) + 1;
  carrySum += Number(c._carry) || 0;
  carryUnpaidSum += Number(c._carryUnpaid) || 0;
}

const frozen = JSON.parse(fs.readFileSync(new URL('../lib/migrate/switchplan-data.json', import.meta.url), 'utf8'));
let frozenCarry = 0; const frozenByKind = {};
for (const c of frozen.contracts) {
  frozenCarry += Number(c._carry) || 0;
  const k = String(c._kind || '?');
  frozenByKind[k] = (frozenByKind[k] || 0) + 1;
}

console.log(JSON.stringify({
  live: {
    asOf: parsed.asOf,
    totals: parsed.totals,
    warnings: parsed.warnings,
    contractCount: parsed.contracts.length,
    contractsByKind: byKind,
    carrySum, carryUnpaidSum,
    vehicleCount: parsed.vehicles.length,
    loanCount: parsed.loans.length,
    activePlatesLength: parsed.activePlates.length,
  },
  jbo: { totals: jbo.totals, warnings: jbo.warnings, txCount: jbo.bank_tx.length },
  frozen: {
    asOf: frozen.asOf,
    contractCount: frozen.contracts.length,
    contractsByKind: frozenByKind,
    carrySum: frozenCarry,
    liveMinusFrozenCarry: carrySum - frozenCarry,
  },
}, null, 2));