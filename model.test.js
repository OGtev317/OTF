import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, validateParents, validState } from './model.js';
test('sample state survives serialization and validates', () => assert.equal(validState(JSON.parse(JSON.stringify(initialState()))), true));
test('rejects self relationships and ancestry cycles', () => { const { people } = initialState(); assert.throws(() => validateParents(people, 'rose', ['rose']), /loop/); assert.throws(() => validateParents(people, 'rose', ['maya']), /loop/); });
test('rejects duplicate or nonexistent parents', () => { const { people } = initialState(); assert.throws(() => validateParents(people, 'new', ['rose', 'rose']), /once/); assert.throws(() => validateParents(people, 'new', ['missing']), /already/); });
test('allows unknown parents and adding a new generation', () => { const { people } = initialState(); assert.doesNotThrow(() => validateParents(people, 'new', [])); assert.doesNotThrow(() => validateParents(people, 'new', ['maya'])); });
test('rejects corrupted saved state and cycles', () => { assert.equal(validState({ people: [] }), false); const state = initialState(); state.people[0].parents = ['maya']; assert.equal(validState(state), false); });
