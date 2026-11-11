// Offline regression reproductions against untouched upstream TypeScript snapshots.
// The dependency boundary (SDK, network and process) is mocked. No wallet or RPC calls.
// Run from repo root: npm run test:additions
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = {
  starter: 'fixtures/perp-starter-index.ts',
  orders: 'fixtures/perp-core-orders.ts',
};
const HASHES = {
  starter: '3e0158ab088489fbd63ff4a0e1a38174d6c5be6a3fee1fd85c4ea19065f731b1',
  orders: 'a9ed57032c74315deafaea99a9ce349875b5bcd4b6eb0d09e2c5065c9402c583',
};

for (const [name, relative] of Object.entries(SOURCE)) {
  const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, relative))).digest('hex');
  assert.equal(actual, HASHES[name], `Unexpected source snapshot: ${relative}`);
}

async function loadOriginal(relative, mocks, env = {}) {
  const output = [];
  let exitCode = null;
  let doneResolve;
  const done = new Promise((resolve) => { doneResolve = resolve; });
  const processMock = {
    env: { DRY_RUN: 'false', ...env },
    exit: (code) => { exitCode = code; doneResolve(); },
  };
  const context = vm.createContext({
    console: { log: (...xs) => output.push(xs.map(String).join(' ')), error: (...xs) => output.push('ERROR: ' + xs.map(String).join(' ')) },
    process: processMock,
    BigInt, Boolean, Number, String, Math, Set, Map, Promise, Date, Infinity,
    setTimeout, clearTimeout,
  });
  const sourceText = fs.readFileSync(path.join(ROOT, relative), 'utf8');
  const js = ts.transpileModule(sourceText, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    fileName: relative,
  }).outputText;
  const mod = new vm.SourceTextModule(js, { context, identifier: relative });
  const cache = new Map();
  await mod.link(async (specifier) => {
    if (cache.has(specifier)) return cache.get(specifier);
    assert.ok(Object.hasOwn(mocks, specifier), `Unexpected import ${specifier}`);
    const exports = mocks[specifier];
    const keys = Object.keys(exports);
    const stub = new vm.SyntheticModule(keys, function () {
      for (const key of keys) this.setExport(key, exports[key]);
    }, { context, identifier: specifier });
    cache.set(specifier, stub);
    return stub;
  });
  await mod.evaluate();
  return { module: mod.namespace, output, done, getExit: () => exitCode };
}

const market = {
  symbol: 'BTC-PERP', display: 'BTC-PERP',
  info: {
    baseSymbol: 'BTC', baseDecimals: 18, quoteDecimals: 18,
    poolAddress: '0x' + '1'.repeat(40), marginBank: '0x' + '2'.repeat(40),
    stopRegistry: '0x' + '3'.repeat(40), minQuantity: 1n,
  },
};
const me = '0x' + '4'.repeat(40);
function starterMocks({ pending, closeResult = { sent: false, filled: 0n } }) {
  const calls = [];
  let pendingIndex = 0;
  const exchange = { walletAddress: me };
  const ctx = { config: { dryRun: false, owner: undefined, symbol: 'BTC-PERP' }, exchange };
  const originalCore = {
    ORDER_TYPE: { MARKET: 2 },
    armBracket: async ({ position }) => { calls.push({ action: 'armBracket', position }); return { sent: true }; },
    cancelStops: async (_ctx, _market, ids) => { calls.push({ action: 'cancelStops', ids: ids.map(String) }); },
    closePosition: async () => { calls.push({ action: 'closePosition', sent: closeResult.sent }); return closeResult; },
    createExchange: () => ctx,
    ensureLeverage: async () => ({ changed: false, from: 2, to: 2 }),
    envNum: (_key, defaultValue) => defaultValue, loadEnv: () => {},
    liveMark: async () => 100, markOf: () => 100,
    onStop: () => () => true, // request a clean shutdown after startup
    pendingStops: async () => { const result = pending[Math.min(pendingIndex, pending.length - 1)]; pendingIndex++; return result; },
    placePerp: async () => ({ sent: true, filled: 10n }),
    positionIn: async () => ({ symbol: market.symbol, side: 'long', contracts: 10, unrealizedPnl: 0 }),
    preflight: async () => ({ ok: true, message: 'preflight ok' }),
    requireMarket: async () => market,
    shutdown: async () => {}, sizeForNotional: () => 10n,
    sizeOrder: async () => ({ ok: true, quantity: 10n }),
    sleep: async () => {}, somiPerStop: async () => 0n,
    tradingKeyCheck: async () => ({ ok: true }),
  };
  return { calls, originalCore };
}
async function runStarter(opts, env = {}) {
  const { calls, originalCore } = starterMocks(opts);
  const loaded = await loadOriginal(SOURCE.starter, { '@dreamdex-bot-kit/perp-core': originalCore }, env);
  await loaded.done;
  assert.equal(loaded.getExit(), 0, 'Starter should exit cleanly in the mock scenario');
  return { calls, logs: loaded.output };
}
async function runClose(initialRaw, latestContracts) {
  const calls = [];
  const exchange = {
    client: { previewPerpClosePnl: async () => ({ priceable: true, closedQuantity: initialRaw }) },
    fetchPositions: async () => [{ symbol: market.symbol, side: 'long', contracts: latestContracts }],
    fetchOrderBook: async () => ({ asks: [[100, 1]], bids: [[100, 1]] }),
    trader: {
      placePerpOrder: async (order) => {
        calls.push({ action: 'placePerpOrder', isBid: order.isBid, quantity: order.quantity.toString(), orderType: order.orderType, reduceOnlySent: Object.hasOwn(order, 'reduceOnly') });
        return { orderId: 7n, fills: [{ quantityFilled: 0n }] };
      },
    },
  };
  const coreDeps = {
    '@somnia-chain/markets-sdk': { ORDER_TYPE: { LIMIT: 0, MARKET: 2, FILL_OR_KILL: 1, POST_ONLY: 3 } },
    viem: { formatUnits: (val, decimals) => (Number(val) / (10 ** decimals)).toString() },
    './exchange.js': { assertTxOk: () => {} },
    './markets.js': { alignPrice: (v) => v, alignQuantity: (v) => v },
    './operator.js': { cancelFor: async () => {}, placeFor: async () => {} },
  };
  const loaded = await loadOriginal(SOURCE.orders, coreDeps);
  await loaded.module.closePosition({ exchange, config: { dryRun: false } }, market, me);
  return { calls, logs: loaded.output };
}

(async () => {
  // QA-004: a bot managing an existing position never arms new stops,
  // yet cancels all pending stops of the same account/market on shutdown.
  const a = await runStarter({ pending: [
    [{ orderIdRaw: 77n }, { orderIdRaw: 88n }],
    [{ orderIdRaw: 77n }, { orderIdRaw: 88n }],
  ] });
  assert.equal(a.calls.some((x) => x.action === 'armBracket'), false);
  assert.deepEqual(a.calls.filter((x) => x.action === 'cancelStops').map((x) => x.ids), [['77', '88']]);
  console.log('QA-004 PASS | no stops created by bot | cancelStops called with existing IDs 77,88');

  // QA-005: preview returned ten contracts, later position contains only two;
  // core submits an ordinary SELL for ten instead of limiting it to two.
  const b = await runClose(10n * 10n ** 18n, 2);
  assert.deepEqual(b.calls, [{ action: 'placePerpOrder', isBid: false, quantity: '10000000000000000000', orderType: 2, reduceOnlySent: false }]);
  const bControl = await runClose(2n * 10n ** 18n, 2);
  assert.equal(bControl.calls[0].quantity, '2000000000000000000');
  console.log('QA-005 PASS | preview 10 -> latest position 2 -> SELL 10e18 (normal MARKET order, no reduceOnly field)');
  console.log('QA-005 CONTROL PASS | preview 2 -> latest position 2 -> SELL 2e18');

  // QA-006: bot creates bracket; at shutdown it cancels the two stop IDs
  // before calling closePosition, which reports the attempted close was NOT sent.
  const c = await runStarter({ pending: [[], [{ orderIdRaw: 501n }, { orderIdRaw: 502n }]] }, { PERP_FLATTEN_ON_EXIT: 'true' });
  assert.deepEqual(c.calls, [
    { action: 'armBracket', position: 'long' },
    { action: 'cancelStops', ids: ['501', '502'] },
    { action: 'closePosition', sent: false },
  ]);
  console.log('QA-006 PASS | armBracket -> cancelStops(501,502) -> closePosition(sent:false)');
  console.log('All 3 independent source-path reproductions passed. Offline only; no live orders.');
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
