import { test, expect } from 'vitest';
import { soundex, matchScore, suggestMatches } from '../matching.js';
const person = (id, name, extra = {}) => ({ id, name, parents: [], life_status: 'living', ...extra });
test('soundex groups names that sound alike', () => {
  expect(soundex('Robert')).toBe('R163'); expect(soundex('Rupert')).toBe('R163');
  expect(soundex('Ashcraft')).toBe('A261'); expect(soundex('Tymczak')).toBe('T522'); expect(soundex('Pfister')).toBe('P236');
  expect(soundex('Smith')).toBe(soundex('Smyth')); expect(soundex('Bennett')).toBe(soundex('Benet')); expect(soundex('')).toBe('');
});
test('scores first names, nicknames, surnames by sound, and birth years', () => {
  expect(matchScore({ display_name: 'Jordan Bennett' }, person('a', 'Jordan Bennett'))).toBe(2);
  expect(matchScore({ display_name: 'Liz Benet' }, person('a', 'Elizabeth Bennett'))).toBeCloseTo(1.35);
  expect(matchScore({ display_name: 'José García' }, person('a', 'Jose Garcia'))).toBe(2);
  expect(matchScore({ display_name: 'Maya Rivera' }, person('a', 'Maya Ann Bennett Rivera'))).toBe(2);
  expect(matchScore({ display_name: 'Maya Rivera' }, person('a', 'Maya Bennett'))).toBe(1);
  expect(matchScore({ display_name: 'Ava' }, person('a', 'Leo Bennett'))).toBe(0);
  expect(matchScore({ display_name: 'Jordan Bennett', birth_year: 1995 }, person('a', 'Jordan Bennett', { birth_date: '1996-02-02' }))).toBe(2.5);
  expect(matchScore({ display_name: 'Jordan Bennett', birth_year: 1995 }, person('a', 'Jordan Bennett', { birth_date: '1960-02-02' }))).toBe(0);
});
test('suggests living, unlinked people, best first', () => {
  const people = [person('j', 'Jordan Bennett'), person('j2', 'Jordan Bennet Smith'), person('dead', 'Jordan Bennett', { life_status: 'deceased' }), person('taken', 'Jordan Bennett'), person('x', 'Leo Bennett')];
  const found = suggestMatches({ display_name: 'Jordan Bennett' }, people, [{ person_id: 'taken' }]);
  expect(found.map((m) => m.person.id)).toEqual(['j', 'j2']);
});
