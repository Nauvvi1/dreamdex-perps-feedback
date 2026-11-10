// Reproduce two Bot Kit source-level findings without installing packages or using the network.
// Node 18+; no private key, no orders. Uses a pinned upstream source snapshot (MIT license).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
const root=resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source=readFileSync(resolve(root,'fixtures/perp-starter-index.ts'),'utf8');

// Issue 001: execute the original 4-line TP/SL calculation, unchanged, for each side.
const begin=source.indexOf('  const up = BigInt(');
const end=source.indexOf('  const px = (v: bigint)',begin);
assert(begin>=0 && end>begin,'Cannot locate original price calculation');
const calculation=source.slice(begin,end);
function calculate(side) {
  const ctx={BigInt,Math,Number};
  runInNewContext(`const mark=100, TAKE_PROFIT_PCT=2, STOP_LOSS_PCT=1, SIDE=${JSON.stringify(side)};\n${calculation}\nthis.result={takeProfit: Number(takeProfit)/1e18,stopLoss:Number(stopLoss)/1e18};`,ctx,{timeout:1000});
  return ctx.result;
}
const long=calculate('long'), short=calculate('short');
assert.equal(long.takeProfit,102); assert.equal(long.stopLoss,99);
assert.equal(short.takeProfit,99); assert.equal(short.stopLoss,102);
console.log('001 | Config: take profit 2%, stop loss 1%, mark 100');
console.log(`    LONG : TP ${long.takeProfit}, SL ${long.stopLoss} (expected 102, 99)`);
console.log(`    SHORT: TP ${short.takeProfit}, SL ${short.stopLoss} (expected 98, 101)`);
console.log('    RESULT: Reproduced — SHORT uses reversed configured percentages.');

// Issue 002: evaluate original SIDE assignment (remove only TypeScript `as Side` annotation).
const sideLine=source.match(/^const SIDE = (.*);$/m)?.[1];
assert(sideLine,'Cannot locate original PERP_SIDE assignment');
const sideExpression=sideLine.replace(/\s+as Side$/,'');
assert.notEqual(sideLine,sideExpression,'Unexpected SIDE expression syntax');
function getSide(value) {
  return runInNewContext(`(${sideExpression})`,{process:{env:{PERP_SIDE:value}}},{timeout:1000});
}
assert.equal(getSide('short'),'short');
assert.equal(getSide('long'),'long');
assert.equal(getSide('shrot'),'long');
console.log('002 | PERP_SIDE=shrot -> LONG (expected rejection of invalid value)');
console.log('    RESULT: Reproduced — invalid side silently resolves to LONG.');
console.log('Offline tests complete. No transactions were made.');
