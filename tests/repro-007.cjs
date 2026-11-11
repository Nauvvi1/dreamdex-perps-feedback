/* Offline reproduction: loads the ORIGINAL upstream TypeScript strategy in a VM.
 * Only TS syntax is stripped with Node's built-in stripTypeScriptTypes; runtime logic is untouched.
 * Needs Node >=22. No third-party dependencies, wallets, or network access.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');

const source = process.argv[2] || path.join(__dirname, '../fixtures/perp-maker-index.ts');
const original = fs.readFileSync(source,'utf8');
const js = stripTypeScriptTypes(original, {mode:'strip'});
const out = [];

async function runScenario(label, failNextRefresh) {
  const events = [];
  let tick = 0, marketLoads = 0, nextId=101n, exitResolve;
  const exited = new Promise(resolve => { exitResolve=resolve; });
  const market = {symbol:'BTC/USDso:USDso',display:'BTC-PERP',info:{poolAddress:'0x1234',baseDecimals:18,baseSymbol:'BTC'}};
  const ctx = {config:{symbol:'BTC-PERP',dryRun:false},exchange:{walletAddress:'0x1111111111111111111111111111111111111111'}};
  const mocks = {
    ORDER_TYPE:{POST_ONLY:3}, loadEnv:()=>{}, envNum:(_k,v)=>v,
    createExchange:()=>ctx, onStop:()=>()=>!failNextRefresh && tick>=1,
    requireMarket:async()=>{ marketLoads++; events.push(`requireMarket ${marketLoads}`); if(failNextRefresh && marketLoads===3) throw new Error('Indexer RPC timeout');return market;},
    liveMark:async()=>100, preflight:async()=>({ok:true,message:'preflight ok'}),
    tradingKeyCheck:async()=>({ok:true}),ensureLeverage:async()=>({changed:false}),
    positionIn:async()=>undefined,
    sizeForNotional:()=>1n,
    sizeOrder:async()=>({ok:true,quantity:1n}),
    placePerp:async({side})=>{const id=nextId++;events.push(`place ${side} id=${id}`);return {sent:true,orderId:id,filled:0n};},
    cancelQuietly:async(_ctx,_market,id)=>{events.push(`cancel id=${id}`);},
    sleep:async()=>{tick++;events.push(`sleep ${tick}`);},
    shutdown:async()=>{events.push('shutdown');}
  };
  let exitCode=null;
  const fakeProcess = {
    env:{DRY_RUN:'false'}, exit(code){exitCode=code;events.push(`exit ${code}`);exitResolve();},
  };
  const context=vm.createContext({process:fakeProcess,console:{log:(...a)=>events.push(`log ${a.join(' ')}`),error:(...a)=>events.push(`error ${a.join(' ')}`)},setTimeout,clearTimeout});
  const mod = new vm.SourceTextModule(js,{context,identifier:source});
  await mod.link(specifier=>{
    assert.equal(specifier,'@dreamdex-bot-kit/perp-core');
    return new vm.SyntheticModule(Object.keys(mocks),function(){for(const [k,v] of Object.entries(mocks))this.setExport(k,v);},{context});
  });
  await mod.evaluate();
  await Promise.race([exited,new Promise((_,reject)=>setTimeout(()=>reject(new Error('strategy failed to exit')),2000))]);
  const result={scenario:label,exitCode,placed:events.filter(e=>e.startsWith('place ')),cancellations:events.filter(e=>e.startsWith('cancel ')),events};
  out.push(result);
  return result;
}

(async()=>{
 const crash=await runScenario('Transient market reload failure after resting bid/ask',true);
 assert.equal(crash.exitCode,1);
 assert.deepEqual(crash.placed,['place long id=101','place short id=102']);
 assert.deepEqual(crash.cancellations,[]);
 const graceful=await runScenario('Graceful stop after resting bid/ask',false);
 assert.equal(graceful.exitCode,0);
 assert.deepEqual(graceful.placed,['place long id=101','place short id=102']);
 assert.deepEqual(graceful.cancellations,['cancel id=101','cancel id=102']);
 console.log(JSON.stringify({source,tests:'2 passed',result:out},null,2));
})().catch(err=>{console.error(err);process.exitCode=1});
