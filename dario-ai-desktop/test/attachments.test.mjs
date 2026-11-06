import test from 'node:test';
import assert from 'node:assert/strict';
import {
 cleanFileName,validateFiles,normalizeText,shouldAttachPaste,makePromptMessages,
 MAX_FILE_CHARS,MAX_CONTEXT_TOTAL_CHARS
} from '../attachments.mjs';

test('pastes with many lines become local text files',()=>{
 assert.equal(shouldAttachPaste('x\n'.repeat(75)),true);
 assert.equal(shouldAttachPaste('a'.repeat(4501)),true);
 assert.equal(shouldAttachPaste('short code'),false);
});
test('text files are validated and filenames sanitized',()=>{
 const file=validateFiles([{name:'../foo?.ts',content:'console.log(1)'}])[0];
 assert.ok(!file.name.includes('/'));
 assert.ok(!file.name.includes('?'));
 assert.equal(file.content,'console.log(1)');
 assert.throws(()=>validateFiles([{name:'x',content:'x'.repeat(MAX_FILE_CHARS+1)}]));
 assert.throws(()=>validateFiles([{name:'x',content:'binary\0bad'}]));
 assert.throws(()=>validateFiles(new Array(6).fill({name:'a',content:'b'})));
});
test('empty prompts allowed with attachments only',()=>{
 assert.equal(normalizeText(' ',true),'');
 assert.throws(()=>normalizeText(' ',false));
 assert.throws(()=>normalizeText('x'.repeat(20001),true));
});
test('large attachments are included within explicit model context cap',()=>{
 const chat={messages:[
  {id:'a',role:'user',text:'Analizza questo file',at:''},
  {id:'b',role:'assistant',text:'Risposta precedente'},
  {id:'c',role:'user',text:'Trova problemi nel codice'},
 ]};
 const prompt=makePromptMessages(chat,[],[{name:'test.py',content:'x'.repeat(180000)}]);
 assert.equal(prompt.input.length,3);
 assert.ok(prompt.input[2].content.includes('FILE TRONCATO'));
 assert.ok(prompt.input[2].content.length <= MAX_CONTEXT_TOTAL_CHARS+500);
 assert.equal(prompt.input[1].content,'Risposta precedente');
 assert.match(prompt.instructions,/file risulta troncato/);
});
test('restore old messages without ids in prompt context',()=>{
 const chat={messages:[{role:'user',text:'ciao'},{role:'assistant',text:'salve'}]};
 const prompt=makePromptMessages(chat,[],[]);
 assert.deepEqual(prompt.input,[{role:'user',content:'ciao'},{role:'assistant',content:'salve'}]);
});
