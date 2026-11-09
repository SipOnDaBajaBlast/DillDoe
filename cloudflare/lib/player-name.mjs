// Player name rules shared by the player registry.
// Real names and short nicknames such as "apple" or "kya" are welcome;
// keyboard mashing such as "asdasd" is not. Only letters and spaces are allowed.

const MIN_LENGTH = 2;
const MAX_LENGTH = 24;

const LENGTH_ERROR = 'Use 2–24 letters and spaces.';
const FORMAT_ERROR = 'Use letters and spaces only — numbers and symbols are not allowed.';
const GIBBERISH_ERROR = 'That name looks like random typing. Please use your real name or a nickname other players will recognize, like “Alex”, “Apple”, or “Kya”.';

// Placeholder names and keyboard mash that would otherwise pass the letter checks.
const JUNK_NAMES = new Set([
  'asd', 'asdf', 'asdfasdf', 'asdfgh', 'asdfghjkl', 'wasd', 'qwe', 'qwer', 'qwert',
  'qwerty', 'qwertyuiop', 'zxc', 'zxcv', 'zxcvbn', 'zxcvbnm', 'abc', 'abcd', 'abcabc',
  'test', 'tests', 'tester', 'testing', 'testtest', 'player', 'players', 'username',
  'usernames', 'unknown', 'anonymous', 'anon', 'admin', 'administrator', 'moderator',
  'mod', 'null', 'undefined', 'none', 'nobody', 'lorem', 'ipsum', 'name', 'myname',
  'yourname', 'gibberish', 'dilldoe', 'sadasd', 'sadasdasd',
]);

// Rows, columns, and their reverses; four letters from one line is a mash, not a name.
const KEYBOARD_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const KEYBOARD_RUNS = [...KEYBOARD_ROWS, 'qazwsxedcrfvtgbyhnujmikolp']
  .flatMap(run => [run, [...run].reverse().join('')]);

const CONSONANT_RUN = /[bcdfghjklmnpqrstvwxz]{5,}/;
const HAS_VOWEL = /[aeiouy]/;

function pairsOf(letters) {
  const pairs = [];
  for (let index = 1; index < letters.length; index++) pairs.push(letters.slice(index - 1, index + 1));
  return pairs;
}

// "asdasd", "sadasdasd", "dfgdfg": a chunk typed twice in a row.
function adjacentRepeat(letters) {
  for (let size = 3; size <= Math.floor(letters.length / 2); size++) {
    for (let start = 0; start + size * 2 <= letters.length; start++) {
      const unit = letters.slice(start, start + size);
      if (unit !== letters.slice(start + size, start + size * 2)) continue;
      if (KEYBOARD_ROWS.some(row => [...unit].every(letter => row.includes(letter)))) return true;
    }
  }
  for (let start = 0; start + 6 <= letters.length; start++) {
    const unit = letters.slice(start, start + 2);
    if (unit + unit + unit === letters.slice(start, start + 6)) return true;
  }
  return false;
}

function keyboardRun(letters) {
  for (let start = 0; start + 4 <= letters.length; start++) {
    const window = letters.slice(start, start + 4);
    if (KEYBOARD_RUNS.some(run => run.includes(window))) return true;
  }
  return false;
}

// Names typed entirely on one keyboard row using only a few keys.
function homeRowMash(letters) {
  if (letters.length < 5) return false;
  if (!KEYBOARD_ROWS.some(row => [...letters].every(letter => row.includes(letter)))) return false;
  // "asdasd", "dsadsa", "sadasdasd", "dadada": a handful of keys hammered in one row.
  if (letters.length >= 6 && new Set(letters).size <= 3) return true;
  const pairs = pairsOf(letters);
  if (new Set(pairs).size / pairs.length < 0.8) return true;
  // "asddsa": a consonant run inside a name typed entirely on one row.
  return /[bcdfghjklmnpqrstvwxz]{3,}/.test(letters);
}

export function checkPlayerName(value) {
  if (typeof value !== 'string') return { ok: false, error: LENGTH_ERROR };
  const name = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (name.length < MIN_LENGTH || name.length > MAX_LENGTH) return { ok: false, error: LENGTH_ERROR };
  if (!/^\p{L}[\p{L} ]*\p{L}$/u.test(name)) return { ok: false, error: FORMAT_ERROR };

  const lower = name.toLowerCase();
  const letters = lower.replace(/[^\p{L}]/gu, '');

  if (JUNK_NAMES.has(letters)) return { ok: false, error: GIBBERISH_ERROR };
  if (/([\p{L}])\1{2,}/u.test(lower)) return { ok: false, error: GIBBERISH_ERROR };
  if (adjacentRepeat(letters)) return { ok: false, error: GIBBERISH_ERROR };
  if (keyboardRun(letters)) return { ok: false, error: GIBBERISH_ERROR };
  if (homeRowMash(letters)) return { ok: false, error: GIBBERISH_ERROR };
  if (!HAS_VOWEL.test(letters)) return { ok: false, error: GIBBERISH_ERROR };
  if (CONSONANT_RUN.test(letters)) return { ok: false, error: GIBBERISH_ERROR };

  return { ok: true, name };
}
