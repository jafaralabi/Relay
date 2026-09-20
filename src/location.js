/**
 * Calculates Levenshtein edit distance between two strings.
 */
function levenshteinDistance(str1, str2) {
  const m = str1.length;
  const n = str2.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

/**
 * Normalizes text by lowercasing, removing punctuation, and stripping common stop words.
 */
function normalizeText(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\b(market|park|school|bus|stop|entrance|gate|junction|road|street|garage)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Phonetic / Soundex-like token transformation for Nigerian English / Pidgin place phonetics.
 * Maps 'agaigee', 'a gay gay', 'agege gey' -> 'agege'
 */
function phoneticNormalize(text) {
  let s = text.toLowerCase();

  // Handle spaced phonetic spellings like 'a gay gay' or 'a gai gee'
  s = s.replace(/\ba\s+gay\s+gay\b/g, 'agege');
  s = s.replace(/\ba\s+gai\s+gee\b/g, 'agege');

  // Phonetic substitutions for vowels & diphthongs
  s = s.replace(/a[gi]+e*/g, 'age');
  s = s.replace(/ge[ei]+/g, 'ge');
  s = s.replace(/gay/g, 'ge');
  s = s.replace(/gai/g, 'ge');

  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Matches a input string against gazetteer locations using exact, alias, fuzzy, and phonetic rules.
 * @param {string} inputLocation Raw location or report text
 * @param {Array} locations List of location objects from locations.json
 * @returns {Object|null} Matching location object or null
 */
function fuzzyMatchLocation(inputLocation, locations, options = {}) {
  if (!inputLocation || !locations || locations.length === 0) return null;
  // `strict` = exact/alias substring matching only (use for whole report text)
  const strict = options.strict === true;

  const rawLower = inputLocation.toLowerCase();
  const rawSquashed = rawLower.replace(/[^a-z0-9]/g, '');
  const normalizedInput = normalizeText(inputLocation);
  const phoneticInput = phoneticNormalize(normalizedInput);

  // 1. Direct substring check on raw text against name and aliases (also with spaces/punctuation removed, so "mile12" matches "mile 12")
  for (const loc of locations) {
    const names = [loc.name, ...(loc.aliases || [])].filter(Boolean).map(n => n.toLowerCase());
    for (const n of names) {
      if (rawLower.includes(n)) return loc;
      const squashed = n.replace(/[^a-z0-9]/g, '');
      if (squashed.length >= 5 && rawSquashed.includes(squashed)) return loc;
    }
  }

  if (strict) return null;

  // Inputs that reduce to nothing (only generic words) must never match anything
  if (normalizedInput.length < 4) return null;

  // 2. Whole-string comparison on normalized text (only when the input is a meaningful length)
  for (const loc of locations) {
    for (const cand of [loc.name, ...(loc.aliases || [])]) {
      const normCand = normalizeText(cand);
      if (normCand.length >= 4 && (normalizedInput.includes(normCand) || normCand.includes(normalizedInput))) return loc;
    }
  }

  // 3. Phonetic whole-string comparison
  for (const loc of locations) {
    for (const cand of [loc.name, ...(loc.aliases || [])]) {
      const phoneticCand = phoneticNormalize(normalizeText(cand));
      if (phoneticCand.length >= 4 && (phoneticInput.includes(phoneticCand) || phoneticCand.includes(phoneticInput))) return loc;
    }
  }

  // 4. Token-level fuzzy match: distinctive tokens only (5+ letters), 1 edit for 5-7 letters, 2 edits for 8+ letters
  const maxDistance = len => (len >= 8 ? 2 : 1);
  const inputTokens = [...new Set([...normalizedInput.split(' '), ...phoneticInput.split(' ')])].filter(t => t.length >= 5);
  for (const loc of locations) {
    for (const cand of [loc.name, ...(loc.aliases || [])]) {
      const candNorm = normalizeText(cand);
      const candTokens = [...new Set([...candNorm.split(' '), ...phoneticNormalize(candNorm).split(' ')])].filter(t => t.length >= 5);
      for (const a of inputTokens) {
        for (const b of candTokens) {
          if (levenshteinDistance(a, b) <= Math.min(maxDistance(a.length), maxDistance(b.length))) return loc;
        }
      }
    }
  }

  return null;
}

module.exports = {
  levenshteinDistance,
  normalizeText,
  phoneticNormalize,
  fuzzyMatchLocation
};
