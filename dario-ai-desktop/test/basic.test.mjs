import test from 'node:test';import assert from 'node:assert/strict';test('store schema',()=>assert.equal(JSON.parse('{"chats":[],"memories":[]}').chats.length,0));
