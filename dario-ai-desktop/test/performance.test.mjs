import test from 'node:test';
import assert from 'node:assert/strict';
import {chatSummary,lightweightSnapshot} from '../perf-store.mjs';
test('sidebar snapshots do not copy large chat bodies',()=>{
 const huge='x'.repeat(150000);
 const messages=Array.from({length:400},(_,i)=>({id:'m'+i,text:huge,role:'assistant',at:'2026-11-06'}));
 const store={chats:[{id:'chat1',title:'Chat grande',messages,created:'today'}],memories:[],model:'gpt-model'};
 const first=performance.now();
 const result=lightweightSnapshot(store,{status:'connected',sharing:true},[{slug:'gpt-model'}],false,null,1);
 assert.ok(performance.now()-first<150,'Creating lightweight snapshot should not traverse message bodies');
 assert.equal(result.data.chats[0].messageCount,400);
 assert.equal(result.data.chats[0].lastMessageId,'m399');
 assert.equal(result.data.chats[0].messages,undefined);
 assert.ok(JSON.stringify(result).length<1500);
 assert.equal(result.data.model,'gpt-model');
 assert.equal(result.busy,false);
});
test('chat metadata reports empty conversations',()=>{
 assert.deepEqual(chatSummary({id:'a',title:'Nuova',messages:[]}),{id:'a',title:'Nuova',created:undefined,messageCount:0,lastMessageId:'',lastMessageAt:''});
});
