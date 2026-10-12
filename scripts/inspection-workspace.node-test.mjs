import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectionDisplayStatus, readableInspectionType, visibleProjectInspections } from '../lib/dominicInspectionWorkspace.mjs';
const rows = [
 {id:'a',asset_name:'North tank',inspection_type:'visual',objective:'Check coating',status:'review'},
 {id:'b',asset_name:'Roof east',inspection_type:'thermal',objective:null,status:'planned'},
 {id:'c',asset_name:'Pipe rack',inspection_type:'visual',objective:'Supports',status:'complete'},
 {id:'d',asset_name:'Pump room',inspection_type:'visual',objective:null,status:'cancelled'},
 {id:'e',asset_name:'Unknown',inspection_type:'visual',objective:null,status:'unexpected'},
];
test('saved status gives a plain-language action without upgrading readiness', () => {
 assert.equal(inspectionDisplayStatus('review').action,'Review findings');
 assert.equal(inspectionDisplayStatus('planned').action,'Set up capture');
 assert.equal(inspectionDisplayStatus('capturing').action,'Review incoming photos');
 assert.equal(inspectionDisplayStatus('complete').action,'Open report');
 assert.equal(inspectionDisplayStatus('unexpected').group,'unknown');
 assert.equal(inspectionDisplayStatus('__proto__').group,'unknown');
});
test('review, active, complete and cancelled filters stay separate', () => {
 assert.deepEqual(visibleProjectInspections(rows,'','review').map(r=>r.id),['a']);
 assert.deepEqual(visibleProjectInspections(rows,'','active').map(r=>r.id),['b']);
 assert.deepEqual(visibleProjectInspections(rows,'','complete').map(r=>r.id),['c']);
 assert.deepEqual(visibleProjectInspections(rows,'','closed').map(r=>r.id),['d']);
 assert.equal(visibleProjectInspections(rows,'','all').length,5);
});
test('search finds asset names, purposes, types and IDs without changing the source', () => {
 const copy=structuredClone(rows);
 assert.equal(visibleProjectInspections(rows,' COATING ','all')[0].id,'a');
 assert.equal(visibleProjectInspections(rows,'THERMAL','all')[0].id,'b');
 assert.equal(visibleProjectInspections(rows,'pipe','complete')[0].id,'c');
 assert.equal(visibleProjectInspections(rows,'pipe','review').length,0);
 assert.equal(visibleProjectInspections(rows,'not found','all').length,0);
 assert.deepEqual(rows,copy);
});
test('empty lists remain empty and unknown types remain readable', () => {
 assert.deepEqual(visibleProjectInspections([],'','all'),[]);
 assert.equal(readableInspectionType('visual'),'Visual inspection');
 assert.equal(readableInspectionType('roof_survey'),'roof survey');
});
