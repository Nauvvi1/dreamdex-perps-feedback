'use strict';
/*
 * SDK 0.32.1 linked-wallet address-casing reproduction.
 * Loads the unchanged TypeScript source and replaces only external imports and
 * readContract; all classification logic is executed from the SDK itself.
 * No RPC calls, wallets or funds are used.
 * Run from repository root: node tests/repro-009.cjs
 * Requires typescript (existing repository devDependency).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
let ts;
try { ts = require('typescript'); }
catch { try { ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript'); }
catch { console.error('Install TypeScript first: npm install'); process.exit(2); } }
const srcPath = path.resolve(__dirname, '../fixtures/sdk-perp-linkedWallet-0.32.1.ts');
const original = fs.readFileSync(srcPath, 'utf8');
const js = ts.transpileModule(original, {compilerOptions:{ module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }}).outputText;
const stubs = {
  '../gql/gql.js':{ graphql:(source)=>({source}) },
  '../indexerRead.js':{},
  '../readsAbi.js':{ marginBankReadAbi:[], linkedWalletRegistryReadAbi:[] },
  '../tradeAbi.js':{},
  '../writer.js':{},
  '../errors.js':{ InvalidInputError:class InvalidInputError extends Error{} },
};
const context={exports:{}, require(spec){ if(!(spec in stubs))throw Error('Unexpected module: '+spec); return stubs[spec] }, console, BigInt};
vm.runInNewContext(js,context,{filename:'sdk-perp-linkedWallet-0.32.1.ts'});
const {getPerpWalletLinkage, quotePerpFundingPayer}=context.exports;
const MAIN_CHECKSUM='0x52908400098527886E0F7030069857D2E4169EE7';
const MAIN_LOWER=MAIN_CHECKSUM.toLowerCase();
const CHILD='0xde709f2102306220921060314715629080e2fb77';
const REGISTRY='0x1111111111111111111111111111111111111111';
const BANK='0x2222222222222222222222222222222222222222';
const ZERO='0x0000000000000000000000000000000000000000';
const rpcCalls=[];
const rpc={async readContract({functionName,args}){
  rpcCalls.push({functionName,args:args||[]});
  switch(functionName){
    case 'linkageOf':return {main:MAIN_CHECKSUM,members:[MAIN_CHECKSUM,CHILD],linkedAt:1n,maturesAt:2n};
    case 'getLinkedWalletRegistry':return REGISTRY;
    case 'quoteFundingPayer':return ZERO;
    case 'mainOf':return MAIN_CHECKSUM;
    default:throw Error('Unexpected RPC method '+functionName);
  }
}};
(async()=>{
  assert.equal(MAIN_CHECKSUM.toLowerCase(),MAIN_LOWER,'inputs are same EVM address');
  const a=await getPerpWalletLinkage(REGISTRY,MAIN_CHECKSUM,rpc);
  const b=await getPerpWalletLinkage(REGISTRY,MAIN_LOWER,rpc);
  assert.equal(a.isMain,true); assert.equal(a.isChild,false);
  assert.equal(b.isMain,false); assert.equal(b.isChild,true);
  const c=await quotePerpFundingPayer(BANK,MAIN_CHECKSUM,rpc);
  const d=await quotePerpFundingPayer(BANK,MAIN_LOWER,rpc);
  assert.equal(c.reason,'isMain'); assert.equal(d.reason,'unlinked');
  const result={result:'PASS: wrong SDK classification reproduced on same EVM address', sourceSha256:crypto.createHash('sha256').update(original).digest('hex'),sdkVersion:'0.32.1', mode:'original TypeScript with mocked readContract (no actual testnet execution)',inputAddresses:{eip55:MAIN_CHECKSUM,lowercase:MAIN_LOWER,sameAddress:true},contractState:{main:MAIN_CHECKSUM,members:[MAIN_CHECKSUM,CHILD],registry:REGISTRY,quoteFundingPayer:ZERO},getPerpWalletLinkage:{checksum:{isMain:a.isMain,isChild:a.isChild},lowercase:{isMain:b.isMain,isChild:b.isChild}},quotePerpFundingPayer:{checksum:c,lowercase:d},rpcCalls:rpcCalls.map(x=>x.functionName)};
  console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
