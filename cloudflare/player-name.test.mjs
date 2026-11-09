import test from 'node:test';
import assert from 'node:assert/strict';
import {checkPlayerName} from './lib/player-name.mjs';

test('accepts real names and short nicknames', () => {
  for (const name of [
    'apple', 'kya', 'Alex', 'Jordan Lee', 'José', 'O\'Brien', 'Jean-Luc', 'Mary Jane Watson',
    'momo', 'jojo', 'Lynn', 'Wright', 'Nguyen', 'Sky', 'Sasha', 'Anna', 'apple123',
    'Alex_99', 'Cleveland Brown', 'Alexandra Montgomery',
  ]) {
    assert.equal(checkPlayerName(name).ok, true, `${name} should be allowed`);
  }
});

test('rejects keyboard mash and placeholder names', () => {
  for (const name of [
    'asdasd', 'Asd123', 'qwerty', 'qwertyuiop', 'asdfgh', 'zxcvbn', 'aaaaaa', 'sdkjfh',
    'fjdksl', 'dfgdfg', 'asasas', 'ababab', 'hjkl', 'qweasdzxc', 'asdfasdf', 'asd',
    'test', 'Player', 'sdf', 'asd543', 'qqqq', 'abcdefghijklmnopqrstuvwxy', 'Alexandra Montgomeryabcde',
  ]) {
    assert.equal(checkPlayerName(name).ok, false, `${name} should be rejected`);
  }
});

test('rejects unusable formats without calling them gibberish', () => {
  for (const name of ['', 'a', '   ', '!!!!', 'a1', '12345', '1234567', '.hidden', 'name.']) {
    const result = checkPlayerName(name);
    assert.equal(result.ok, false, `${JSON.stringify(name)} should be rejected`);
  }
  assert.match(checkPlayerName('12345').error, /2–24 characters/);
  assert.match(checkPlayerName('!!!!').error, /2–24 characters/);
  assert.match(checkPlayerName('asdasd').error, /random typing/);
});

test('normalizes surrounding and repeated whitespace', () => {
  assert.equal(checkPlayerName('  Apple  ').name, 'Apple');
  assert.equal(checkPlayerName('Mary   Jane').name, 'Mary Jane');
});
