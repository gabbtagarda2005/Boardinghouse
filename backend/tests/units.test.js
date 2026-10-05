const { test } = require('node:test');
const { expect } = require('expect');
const { round2, splitAmount, sum } = require('../src/utils/money');
const { overlapDays, dueDateFor, daysInMonth } = require('../src/utils/dates');

test('round2 avoids floating point drift', () => {
  expect(round2(0.1 + 0.2)).toBe(0.3);
  expect(round2(1.005)).toBe(1.01);
  expect(sum([0.1, 0.2, 0.3])).toBe(0.6);
});

test('splitAmount always adds up exactly to the total', () => {
  expect(splitAmount(100, [1, 1, 1])).toEqual([33.34, 33.33, 33.33]);
  const parts = splitAmount(1250, [31, 16]);
  expect(round2(parts[0] + parts[1])).toBe(1250);
  expect(parts[0]).toBeGreaterThan(parts[1]);
  expect(splitAmount(50, [0, 0])).toEqual([0, 0]);
  expect(splitAmount(10, [])).toEqual([]);
});

test('overlapDays counts days a stay overlaps a billing month', () => {
  expect(overlapDays(2026, 3, '2026-01-01', null)).toBe(31);
  expect(overlapDays(2026, 3, '2026-03-16', null)).toBe(16);
  expect(overlapDays(2026, 3, '2026-03-01', '2026-03-11')).toBe(10);
  expect(overlapDays(2026, 3, '2026-04-01', null)).toBe(0);
});

test('due date clamps to month length', () => {
  expect(daysInMonth(2026, 2)).toBe(28);
  expect(dueDateFor(2026, 2, 31).getUTCDate()).toBe(28);
  expect(dueDateFor(2026, 5, 10).getUTCDate()).toBe(10);
});
