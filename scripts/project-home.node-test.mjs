import test from 'node:test';
import assert from 'node:assert/strict';
import { assertProjectHomeResponse, projectHomeDate, projectHomePage, projectHomeStatus, projectPhotoCount, readProjectHome } from '../lib/dominicProjectHome.mjs';
const rows = [
  {id:'one',name:'Tank inspections',status:'uploaded',location_snapshot:'Linwood',job:{title:'Coating review'}},
  {id:'two',name:'Roof survey',status:'processing',location_snapshot:null,job:{title:'Roof mission',location:'Claymont'}},
  {id:'three',name:'Pipe rack',status:'completed',job:null},
  {id:'four',name:'Pump station',status:'failed'},
  {id:'five',name:'Retired job',status:'cancelled'},
  {id:'six',name:'Unknown status',status:'other'},
];
test('map completion never claims inspection approval', () => {
  assert.equal(projectHomeStatus('completed').label,'Map processing complete');
  assert.equal(projectHomeStatus('failed').group,'attention');
  assert.equal(projectHomeStatus('cancelled').group,'cancelled');
  assert.equal(projectHomeStatus('other').group,'unknown');
  assert.equal(projectHomeStatus('__proto__').group,'unknown');
});
test('search finds project, mission and both location fields', () => {
  for (const [query,id] of [[' TANK ','one'],['coating','one'],['linwood','one'],['claymont','two']]) {
    assert.equal(projectHomePage(rows,query,'all',0).rows[0].id,id);
  }
});
test('processing filters intersect search without rewriting data', () => {
  const before=structuredClone(rows);
  assert.deepEqual(projectHomePage(rows,'','attention',0).rows.map(r=>r.id),['four']);
  assert.deepEqual(projectHomePage(rows,'','completed',0).rows.map(r=>r.id),['three']);
  assert.equal(projectHomePage(rows,'tank','completed',0).matching,0);
  assert.equal(projectHomePage(rows,'','all',0).matching,6);
  assert.deepEqual(rows,before);
});
test('1005 local rows use bounded pages without discarding the end', () => {
  const projects=Array.from({length:1005},(_,i)=>({id:`p-${i}`,name:`Project ${i}`,status:'draft'}));
  const first=projectHomePage(projects,'','all',0);
  assert.equal(first.rows.length,9); assert.equal(first.pages,112);
  const last=projectHomePage(projects,'','all',111);
  assert.equal(last.rows.length,6); assert.equal(last.rows.at(-1).id,'p-1004');
  assert.equal(projectHomePage(projects,'Project 1004','all',111).page,0);
  // Client paging coverage, not proof that the server returns 1005 rows.
});
test('empty and invalid page values are safe', () => {
  for(const page of [-1,NaN,Infinity,900]) {
    assert.equal(projectHomePage([],'','all',page).page,0);
    assert.equal(projectHomePage(rows,'','all',page).rows.length,6);
  }
});
test('dates and counts do not fabricate zeros or invalid labels', () => {
  assert.equal(projectHomeDate('bad-date'),'Date not recorded');
  assert.equal(projectHomeDate(null),'Date not recorded');
  assert.equal(projectPhotoCount(0),'0 mapping photos');
  assert.equal(projectPhotoCount(1),'1 mapping photo');
  for(const n of [undefined,null,-1,NaN,Infinity,1.5,'9']) assert.equal(projectPhotoCount(n),'Photo count unavailable');
});
test('valid API rows and an actual empty response are accepted', () => {
  assert.doesNotThrow(()=>assertProjectHomeResponse({projects:rows}));
  assert.doesNotThrow(()=>assertProjectHomeResponse({projects:[]}));
});
for(const [name,value] of [
  ['missing response',null], ['missing rows',{}], ['wrong rows',{projects:{}}],
  ['missing row',{projects:[null]}], ['missing ID',{projects:[{name:'test',status:'draft'}]}],
  ['duplicate ID',{projects:[rows[0],rows[0]]}], ['missing name',{projects:[{id:'one',status:'draft'}]}],
  ['missing status',{projects:[{id:'one',name:'test'}]}],
]) test(`reject ${name} instead of an empty success`,()=>assert.throws(()=>assertProjectHomeResponse(value)));
test('the project read uses the existing authenticated API without caching', async()=>{
  const controller=new AbortController();
  const result=await readProjectHome('test-token',controller.signal,async(url,options)=>{
    assert.equal(url,'/api/pilot/mapping/projects');
    assert.equal(options.headers.Authorization,'Bearer test-token');
    assert.equal(options.cache,'no-store'); assert.equal(options.signal,controller.signal);
    return new Response(JSON.stringify({projects:rows}));
  });
  assert.deepEqual(result,rows);
});
test('HTTP, invalid JSON, network and session failures remain explicit',async()=>{
  const signal=new AbortController().signal;
  await assert.rejects(readProjectHome('',signal),/Sign in/);
  await assert.rejects(readProjectHome('token',signal,async()=>new Response(JSON.stringify({error:'Session ended'}),{status:401})),/Session ended/);
  await assert.rejects(readProjectHome('token',signal,async()=>new Response('broken')),/incomplete/);
  await assert.rejects(readProjectHome('token',signal,async()=>{throw new Error('offline');}),/offline/);
});
