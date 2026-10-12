import { describe, expect, it } from 'vitest';
import { capturePlanSignature } from './capturePlanPresentation';

describe('saved plan presentation', () => {
  it('matches JSONB reordered keys without hiding an actual edit', () => {
    const saved = { name: 'Roof', plan_state: { waypointOverrides: { a: { longitude: -75, latitude: 40 } }, patternAltitudeFt: 60 } };
    const current = { plan_state: { patternAltitudeFt: 60, waypointOverrides: { a: { latitude: 40, longitude: -75 } } }, name: 'Roof' };
    expect(capturePlanSignature(saved)).toBe(capturePlanSignature(current));
    current.plan_state.waypointOverrides.a.latitude = 40.1;
    expect(capturePlanSignature(saved)).not.toBe(capturePlanSignature(current));
  });
  it('ignores omitted optional fields, but preserves array order and null', () => {
    expect(capturePlanSignature({ a: undefined, b: [1, 2] })).toBe(capturePlanSignature({ b: [1, 2] }));
    expect(capturePlanSignature({ b: [1, 2] })).not.toBe(capturePlanSignature({ b: [2, 1] }));
    expect(capturePlanSignature({ a: null })).not.toBe(capturePlanSignature({}));
  });
});
