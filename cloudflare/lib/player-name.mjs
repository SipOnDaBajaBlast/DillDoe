// Player name rules shared by the player registry.
// Real names and short nicknames such as "apple" or "kya" are welcome;
// keyboard mashing such as "asdasd" is not.

const MIN_LENGTH = 2;
const MAX_LENGTH = 24;

const FORMAT_ERROR = 'Use 2–24 characters: letters, numbers, spaces, dots, apostrophes, dashes, or underscores, starting with a letter.';
const DIGITS_ERROR = 'Use at least two letters, with fewer numbers than letters.';
const GIBBERISH_ERROR = 'That name looks like random typing. Please use your real name or a nickname other players will recognize, like “Alex”, “Apple”, or “Kya”.';

// Placeholder names and keyboard mash that would otherwise pass the letter checks.
const JUNK_NAMES = new Set([
  'asd', 'asdf', 'asdfasdf', 'asdfgh', 'asdfghjkl', 'wasd', 'qwe', 'qwer', 'qwert',
  'qwerty', 'qwertyuiop', 'zxc', 'zxcv', 'zxcvbn', 'zxcvbnm', 'abc', 'abcd', 'abcabc',
  '123', '1234', '12345', '123456', 'test', 'tests', 'tester', 'testing', 'testtest',
  'player', 'players', 'username', 'usernames', 'unknown', 'anonymous', 'anon', 'admin',
  'administrator', 'moderator', 'mod', 'null', 'undefined', 'none', 'nobody', 'lorem',
  'ipsum', 'name', 'myname', 'yourname', 'gibberish', 'dilldoe',
]);

// Rows, columns, and their reverses; four letters from one line is a mash, not a name.
const KEYBOARD_RUNS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1234567890', 'qazwsxedcrfvtgbyhnujmikolp']
  .flatMap(run => [run, [...run].reverse().join('')]);

const CONSONANT_RUN = /[bcdfghjklmnpqrstvwxz]{5,}/;
const HAS_VOWEL = /[aeiouy]/;

function repeatedUnit(compact) {
  for (let size = 1; size <= Math.min(10, Math.floor(compact.length / 2)); size++) {
    if (compact.length % size) continue;
    if (compact.slice(0, size).repeat(compact.length / size) !== compact) continue;
    // "asdasd" and "ababab" are mash; "momo", "jojo", and "Anna" are names.
    if (size >= 3 || compact.length >= 6) return true;
  }
  return false;
}

function keyboardRun(compact) {
  for (let start = 0; start + 4 <= compact.length; start++) {
    const window = compact.slice(start, start + 4);
    if (KEYBOARD_RUNS.some(run => run.includes(window))) return true;
  }
  return false;
}

export function checkPlayerName(value) {
  if (typeof value !== 'string') return { ok: false, error: FORMAT_ERROR };
  const name = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (name.length < MIN_LENGTH || name.length > MAX_LENGTH) return { ok: false, error: FORMAT_ERROR };
  if (!/^\p{L}[\p{L}\p{N} .,'’_-]*[\p{L}\p{N}]$/u.test(name)) return { ok: false, error: FORMAT_ERROR };

  const letters = (name.match(/\p{L}/gu) || []).length;
  const digits = (name.match(/\p{N}/gu) || []).length;
  if (letters < 2 || digits > letters) return { ok: false, error: DIGITS_ERROR };

  const lower = name.toLowerCase();
  const lettersOnly = lower.replace(/[^\p{L}]/gu, '');
  const compact = lower.replace(/[^\p{L}\p{N}]/gu, '');

  if (JUNK_NAMES.has(lettersOnly) || JUNK_NAMES.has(compact)) return { ok: false, error: GIBBERISH_ERROR };
  if (/([\p{L}\p{N}])\1{2,}/u.test(lower)) return { ok: false, error: GIBBERISH_ERROR };
  if (repeatedUnit(compact)) return { ok: false, error: GIBBERISH_ERROR };
  if (keyboardRun(compact)) return { ok: false, error: GIBBERISH_ERROR };
  if (CONSONANT_RUN.test(lettersOnly) || !HAS_VOWEL.test(lettersOnly)) return { ok: false, error: GIBBERISH_ERROR };

  return { ok: true, name };
}
