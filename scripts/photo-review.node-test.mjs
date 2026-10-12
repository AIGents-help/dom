import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPhotoReviewReport, photoCaptureTime, photoReportDraft, photoReviewStatus } from '../lib/dominicPhotoReview.mjs';
const report = () => ({ inspection: { id: 'inspection-a' }, asset:{id:'asset-a',name:'Tank 02'}, findings: [{ id: 'finding-a', detector:{}, spatial_anchor:{} }], media: [], baselineMedia: [] });
test('only unreviewed saved states expose decision controls', () => {
  for (const state of ['needs_review', 'detected']) assert.equal(photoReviewStatus(state).canReview, true);
  for (const state of ['confirmed', 'dismissed', '', 'unexpected', '__proto__']) assert.equal(photoReviewStatus(state).canReview, false);
  assert.equal(photoReviewStatus('confirmed').label, 'Confirmed finding');
});
test('draft preserves note and explicit exclusion without changing provenance', () => {
  const detector = { reportNote: 'Inspect weld', reportIncluded: false, mediaId: 'media-a' };
  assert.deepEqual(photoReportDraft(detector), { note: 'Inspect weld', included: false });
  assert.equal(detector.mediaId, 'media-a');
  assert.deepEqual(photoReportDraft(null), { note: '', included: true });
  assert.deepEqual(photoReportDraft({ reportNote: 17 }), { note: '', included: true });
});
test('a matching inspection and finding may contain no source media', () => {
  assert.doesNotThrow(() => assertPhotoReviewReport(report(), 'inspection-a', 'finding-a'));
});
for (const [name, data] of [
  ['foreign inspection', { ...report(), inspection: { id: 'inspection-b' } }],
  ['foreign finding', { ...report(), findings: [{ id: 'finding-b' }] }],
  ['missing findings', { ...report(), findings: [] }],
  ['invalid findings', { ...report(), findings: null }],
  ['null finding row', { ...report(), findings: [null] }],
  ['missing current media list', { ...report(), media: undefined }],
  ['missing baseline media list', { ...report(), baselineMedia: null }],
  ['missing asset', { ...report(), asset:null }],
  ['invalid metadata', { ...report(), findings:[{id:'finding-a',detector:null}] }],
  ['null response', null],
]) test(`rejects ${name} instead of rendering mismatched evidence`, () => {
  assert.throws(() => assertPhotoReviewReport(data, 'inspection-a', 'finding-a'), /did not match/);
});
test('missing or invalid capture time never becomes an invented date', () => {
  for (const value of [null, undefined, '', 'not a date']) assert.equal(photoCaptureTime(value), 'Capture time not recorded');
  assert.notEqual(photoCaptureTime('2026-10-01T12:00:00Z'), 'Capture time not recorded');
});
