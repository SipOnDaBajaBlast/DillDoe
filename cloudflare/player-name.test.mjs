import test from 'node:test';
import assert from 'node:assert/strict';
import {checkPlayerName} from './lib/player-name.mjs';

test('accepts real names and short nicknames', () => {
  for (const name of [
    'apple', 'kya', 'Alex', 'Jordan Lee', 'José', 'Mary Jane Watson', 'momo', 'jojo',
    'Lynn', 'Wright', 'Nguyen', 'Sky', 'Sasha', 'Anna', 'Cleveland Brown',
    'Alexandra Montgomery', 'salad', 'flash', 'glass', 'banana', 'Mississippi',
    'Sarah', 'Sara', 'Dallas', 'Michael', 'Emily', 'Willow', 'Bobby', 'Ruby',
    'Grace', 'Leo', 'Kai', 'Mia', 'Zoe', 'Noah', 'Owen', 'Jack', 'Tyler',
    'Mason', 'Lucas', 'Henry', 'Nora', 'Hazel', 'Jade', 'Rose', 'Daisy',
    'Chloe', 'Ella', 'Ivy', 'Steve', 'Dylan', 'Yuki', 'Sakura',
  ]) {
    assert.equal(checkPlayerName(name).ok, true, `${name} should be allowed`);
  }
});

test('rejects keyboard mash and placeholder names', () => {
  for (const name of [
    'asdasd', 'sadasdasd', 'sadasd', 'asddsa', 'dsadsa', 'sdasd', 'dadada', 'asasas',
    'qwerty', 'qwertyuiop', 'asdfgh', 'zxcvbn', 'aaaaaa', 'sdkjfh', 'fjdksl', 'dfgdfg',
    'ababab', 'hjkl', 'qweasdzxc', 'asdfasdf', 'asd', 'test', 'Player', 'sdf',
    'qqqq', 'as d', 'asdf gh',
  ]) {
    assert.equal(checkPlayerName(name).ok, false, `${name} should be rejected`);
  }
});

test('allows only letters and spaces', () => {
  for (const name of [
    'Alex_99', 'apple123', "O'Brien", 'Jean-Luc', 'name.', '.hidden', 'a1',
    '12345', '1234567', '!!!!', '   ', '', 'a', 'Alexandra Montgomeryabcde',
  ]) {
    assert.equal(checkPlayerName(name).ok, false, `${JSON.stringify(name)} should be rejected`);
  }
  assert.match(checkPlayerName('12345').error, /letters and spaces/);
  assert.match(checkPlayerName('Alex99').error, /letters and spaces/);
  assert.match(checkPlayerName('a').error, /2–24 letters and spaces/);
  assert.match(checkPlayerName('asdasd').error, /random typing/);
});

test('normalizes surrounding and repeated whitespace', () => {
  assert.equal(checkPlayerName('  Apple  ').name, 'Apple');
  assert.equal(checkPlayerName('Mary   Jane').name, 'Mary Jane');
  assert.equal(checkPlayerName('two  spaces').name, 'two spaces');
});
