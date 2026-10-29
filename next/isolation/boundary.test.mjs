import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBoundary,apiOrigin} from './boundary.mjs';

const base={
 gosUrl:'https://legacy-gos.supabase.co',
 oldQwizUrl:'https://legacy-gos.supabase.co',
 newQwizUrl:'https://independent-qwiz.supabase.co',
 newQwizKey:'sb_publishable_isolation_test_only'
};
test('independent QWIZ project is accepted',()=>{
 const x=validateBoundary(base);
 assert.equal(x.isolated,true);
 assert.equal(x.next,base.newQwizUrl);
});
test('same Supabase backend is rejected',()=>{
 assert.throws(()=>validateBoundary({...base,newQwizUrl:base.gosUrl}),/same|remains/i);
});
test('missing new backend refuses preview',()=>{
 assert.throws(()=>validateBoundary({...base,newQwizUrl:''}),/absolute URL/);
});
test('secret keys are never suitable for browser preview',()=>{
 for(const key of ['sb_secret_test','sb_service_role_test',''])assert.throws(()=>validateBoundary({...base,newQwizKey:key}));
});
test('only HTTPS for remote hosts; localhost for local development',()=>{
 assert.throws(()=>apiOrigin('http://new-qwiz.example.org','QWIZ'),/HTTPS/);
 assert.equal(apiOrigin('http://localhost:8000','QWIZ'),'http://localhost:8000');
});
test('refuse malformed URL credentials, path and query',()=>{
 for(const url of ['https://u:p@independent-qwiz.supabase.co','https://independent-qwiz.supabase.co/auth/v1','https://independent-qwiz.supabase.co/?api_key=x'])assert.throws(()=>validateBoundary({...base,newQwizUrl:url}),/plain API/);
});
test('migration must be based on the verified legacy backend',()=>{
 assert.throws(()=>validateBoundary({...base,oldQwizUrl:'https://unknown.supabase.co'}),/share/);
});
test('non-anon JWT key is rejected',()=>{
 const key=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url'),'signature'].join('.');
 assert.throws(()=>validateBoundary({...base,newQwizKey:key}),/anon/);
});
