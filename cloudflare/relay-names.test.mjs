import test from 'node:test';
import assert from 'node:assert/strict';
import {uniqueRoomName} from './lib/relay.mjs';

test('keeps a name that is free', () => {
  assert.equal(uniqueRoomName('Alice', []), 'Alice');
  assert.equal(uniqueRoomName('  Bob  ', ['Alice']), 'Bob');
});

test('numbers duplicate names and skips used numbers', () => {
  assert.equal(uniqueRoomName('Alice', ['Alice']), 'Alice2');
  assert.equal(uniqueRoomName('Alice', ['Alice', 'Alice2']), 'Alice3');
  assert.equal(uniqueRoomName('Alice', ['Alice', 'Alice3']), 'Alice2');
  assert.equal(uniqueRoomName('Alice', ['Alice2']), 'Alice');
});

test('compares names case-insensitively', () => {
  assert.equal(uniqueRoomName('alice', ['ALICE']), 'alice2');
});

test('suffixed names stay within 20 characters', () => {
  const base = 'ABCDEFGHIJKLMNOPQRST';
  assert.equal(uniqueRoomName(base, [base]), 'ABCDEFGHIJKLMNOPQRS2');
});
