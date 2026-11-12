'use strict';
/**
 * QA-008 deterministic integration reproduction.
 * Executes untouched upstream source for:
 *  - SDK 0.32.1 getMarginAccount()
 *  - Bot Kit marginSnapshot(), healthRatio()
 *  - Bot Kit perp-guard main()
 * Only imports, network responses, exchange construction, and the stop trigger
 * are replaced with controlled adapters. Each scenario runs in a fresh child
 * process, so the reported process exit codes are REAL Node exit statuses.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const locations = {
  guard: path.join(root, 'fixtures/perp-guard-index.ts'),
  core: path.join(root, 'fixtures/perp-core-margin.ts'),
  sdk: path.join(root, 'fixtures/sdk-perp-margin-0.32.1.ts'),
};
const expected = {
  guard: '5a7712eb30e5baaa8a4657301d121055ecff804e967c7f189637df309ef5e21a',
  core: '041cfbb5a34bc80c6ddb2d71d81b592c979826a950d617aebdbb2533ea58d23a',
  sdk: '46c7289705c534a2da8b969a82211d6792026b0b2a2d08cd8bf52a5d560273b2',
};
function sha256(file) {return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
function verifySources(){
 for (const key of Object.keys(locations)) assert.equal(sha256(locations[key]),expected[key],`Upstream source changed: ${key}`);
}
function getTypeScript(){
 try{return require('typescript');}catch(_){
  const npmRoot=spawnSync('npm',['root','-g'],{encoding:'utf8',timeout:5000});
  if(npmRoot.status===0){try{return require(path.join(npmRoot.stdout.trim(),'typescript'));}catch(_){/* continue */}}
  throw Error('TypeScript compiler missing. Run npm install --ignore-scripts --no-audit --no-fund in the repository root.');
 }
}
function childMain(mode){
 verifySources();
 const ts=getTypeScript();
 function loadOriginal(file,dependencies){
  const source=fs.readFileSync(file,'utf8');
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const moduleObj={exports:{}};
  new Function('require','module','exports','process','console',js)(
   id=>{if(!(id in dependencies))throw Error('Unexpected upstream import '+id);return dependencies[id]},
   moduleObj,moduleObj.exports,process,
   {log:(...xs)=>logs.push(xs.join(' ')),error:(...xs)=>logs.push(xs.join(' '))}
  );
  return moduleObj.exports;
 }
 const logs=[];
 const trace={mode,events:[],logs};
 // Record trace synchronously EVEN WHEN the original strategy calls process.exit().
 process.on('exit',(exitCode)=>{
  trace.exitCode=exitCode;
  fs.writeSync(1,'__PROOF_TRACE__'+JSON.stringify(trace)+'\n');
 });
 const sdkMargin=loadOriginal(locations.sdk,{
  viem:{},'../readsAbi.js':{marginBankReadAbi:[]},'../revert.js':{},'../tradeAbi.js':{},
  '../errors.js':{InvalidInputError:Error,ContractRevertError:Error},
  '../raise.js':{unreachable:()=>{throw Error('unreachable')}},
  '../funding.js':{FUNDING_PRECISION:10n**18n},
  '../readEach.js':{READ_BATCH_CAPACITY:100},
  './state.js':{},'../writer.js':{}
 });
 const coreMargin=loadOriginal(locations.core,{});
 const owner='0x00000000000000000000000000000000000000ab';
 // Both markets share ONE cross-margin bank, as in the real perps model.
 const bank='0x0000000000000000000000000000000000000001';
 const markets=['BTC','ETH'].map((ticker,i)=>({
  symbol:`${ticker}/USDso:USDso`,display:`${ticker}-PERP`,
  info:{marginBank:bank,poolAddress:`0x${String(i+10).padStart(40,'0')}`}
 }));
 let failNextHealthRead=mode==='one-time-rpc-error';
 const publicClient={
  getBlockNumber:async()=>101n,
  readContract:async ({address,functionName})=>{
   assert.equal(address,bank);
   trace.events.push({type:'readContract',name:functionName});
   if(functionName==='getAccountHealth'&&failNextHealthRead){
    failNextHealthRead=false; // PROVE: this is a ONE-TIME error; future attempts would succeed.
    trace.events.push({type:'injectedRpcError',name:functionName,message:'RPC timeout at getAccountHealth (once)'});
    throw Error('RPC timeout at getAccountHealth (once)');
   }
   if(functionName==='getAccountState')return {unlockedCollateralBalance:100n,lockedCollateral:100n,activePerpPools:[]};
   if(functionName==='getWithdrawableCollateral')return 100n;
   if(functionName==='getAccountHealth')return [110n,100n,100n,100n];
   if(functionName==='getMarginStatus')return 0n;
   throw Error('Unexpected RPC read '+functionName);
  }
 };
 const exchange={
  walletAddress:owner,
  client:{getMarginAccount:(marginBank,account)=>sdkMargin.getMarginAccount(marginBank,account,publicClient)},
  fetchPositions:async()=>markets.map(m=>({symbol:m.symbol})),
 };
 let polls=0;
 const deps={
  loadEnv:()=>{},envNum:(_name,def)=>def,
  createExchange:()=>({exchange,config:{symbol:'',dryRun:false}}),
  onStop:()=>()=>polls++>0,
  perpMarkets:async()=>markets,
  marginSnapshot:coreMargin.marginSnapshot,
  healthRatio:coreMargin.healthRatio,
  positionIn:async(_exchange,market)=>{trace.events.push({type:'positionIn',market:market.display});return {side:'long',contracts:1}},
  liveMark:async()=>100,markOf:()=>100,sleep:async()=>{},
  shutdown:async()=>trace.events.push({type:'shutdown'}),
  closePosition:async(_ctx,market)=>{trace.events.push({type:'closePosition',market:market.display});return {sent:true}},
  linkCoverage:async()=>({linked:markets,missing:[]}),
 };
 process.env.DRY_RUN='false';
 loadOriginal(locations.guard,{'@dreamdex-bot-kit/perp-core':deps});
 // main() belongs to original strategy and will call real process.exit(0 | 1).
}
function runChild(mode){
 const p=spawnSync(process.execPath,[__filename,'--child',mode],{
  cwd:root,encoding:'utf8',timeout:10000,maxBuffer:2*1024*1024,
  env:{...process.env,DRY_RUN:'false'}
 });
 if(p.error)throw p.error;
 const traceLine=p.stdout.split(/\r?\n/).find(x=>x.startsWith('__PROOF_TRACE__'));
 assert.ok(traceLine,`Missing proof trace in child ${mode}; stdout=${p.stdout}; stderr=${p.stderr}`);
 const trace=JSON.parse(traceLine.slice('__PROOF_TRACE__'.length));
 return {mode,actualProcessExitStatus:p.status,processSignal:p.signal,trace,stderr:p.stderr};
}
function main(){
 verifySources();
 const control=runChild('all-reads-success');
 const fault=runChild('one-time-rpc-error');
 const events=(r,type)=>r.trace.events.filter(e=>e.type===type);
 assert.equal(control.actualProcessExitStatus,0);
 assert.deepEqual(events(control,'closePosition').map(e=>e.market),['BTC-PERP','ETH-PERP']);
 assert.equal(events(control,'shutdown').length,1);
 assert.equal(events(control,'readContract').filter(e=>e.name==='getAccountHealth').length,2);
 assert.equal(fault.actualProcessExitStatus,1);
 assert.equal(events(fault,'injectedRpcError').length,1);
 assert.equal(events(fault,'readContract').filter(e=>e.name==='getAccountHealth').length,1);
 assert.equal(events(fault,'closePosition').length,0);
 assert.equal(events(fault,'shutdown').length,0);
 assert.ok(fault.trace.logs.some(x=>x.includes('RPC timeout at getAccountHealth (once)')));
 const result={
  report:'008-guard-unhandled-margin-read',
  outcome:'PASS',
  verifiedAgainstUnmodifiedUpstreamSource:true,
  target:'dreamDEX Bot Kit perp-guard; Markets SDK 0.32.1',
  scope:'local deterministic test with mock RPC, no network or transactions',
  node:process.version,typescript:getTypeScript().version,
  sourceSHA256:expected,
  controls:{control,fault},
  conclusion:'One recoverable RPC read error causes the original strategy to call process.exit(1) before monitoring the second position; healthy case handles both and shuts down normally.',
  limitation:'No on-chain liquidation, transaction or monetary loss was tested.',
 };
 fs.mkdirSync(path.join(root,'evidence'),{recursive:true});
 fs.writeFileSync(path.join(root,'evidence/008-guard-margin-read.json'),JSON.stringify(result,null,2)+'\n');
 const lines=[
  'QA-008 — independent local reproduction',
  `Node: ${process.version}; TypeScript: ${result.typescript}`,
  'Source SHA-256 checks: PASS',
  `CONTROL: real process exit ${control.actualProcessExitStatus}; closePosition: ${events(control,'closePosition').map(x=>x.market).join(', ')}; shutdown: ${events(control,'shutdown').length}`,
  `FAULT:   real process exit ${fault.actualProcessExitStatus}; one-time health RPC error: ${events(fault,'injectedRpcError').length}; closePosition: ${events(fault,'closePosition').length}; shutdown: ${events(fault,'shutdown').length}`,
  `Health read counts: healthy=${events(control,'readContract').filter(x=>x.name==='getAccountHealth').length}; fault=${events(fault,'readContract').filter(x=>x.name==='getAccountHealth').length}`,
  'PASS: all assertions satisfied',
  'LIMITATION: controlled mocked RPC, not a live testnet transaction or proof of liquidation.',
 ];
 fs.writeFileSync(path.join(root,'evidence/008-guard-runtime.txt'),lines.join('\n')+'\n');
 console.log(lines.join('\n'));
}
if(process.argv[2]==='--child'){
 try{childMain(process.argv[3]);}catch(e){console.error(e);process.exitCode=90;}
}else{
 try{main();}catch(e){console.error(e);process.exitCode=1;}
}
