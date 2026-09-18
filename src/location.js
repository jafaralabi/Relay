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
function fuzzyMatchLocation(inputLocation, locations) {
  if (!inputLocation || !locations || locations.length === 0) return null;

  const rawLower = inputLocation.toLowerCase();
  const normalizedInput = normalizeText(inputLocation);
  const phoneticInput = phoneticNormalize(inputLocation);

  // 1. Direct string / substring check on raw text against name and aliases
  for (const loc of locations) {
    if (loc.name && rawLower.includes(loc.name.toLowerCase())) {
      return loc;
    }
    if (loc.aliases && loc.aliases.some(alias => rawLower.includes(alias.toLowerCase()))) {
      return loc;
    }
  }

  // 2. Direct check on normalized text
  for (const loc of locations) {
    const normName = normalizeText(loc.name);
    if (normName && (normalizedInput.includes(normName) || normName.includes(normalizedInput))) {
      return loc;
    }
    if (loc.aliases) {
      for (const alias of loc.aliases) {
        const normAlias = normalizeText(alias);
        if (normAlias && (normalizedInput.includes(normAlias) || normAlias.includes(normalizedInput))) {
          return loc;
        }
      }
    }
  }

  // 3. Phonetic check
  for (const loc of locations) {
    const phoneticName = phoneticNormalize(loc.name);
    if (phoneticName && (phoneticInput.includes(phoneticName) || phoneticName.includes(phoneticInput))) {
      return loc;
    }
    if (loc.aliases) {
      for (const alias of loc.aliases) {
        const phoneticAlias = phoneticNormalize(alias);
        if (phoneticAlias && (phoneticInput.includes(phoneticAlias) || phoneticAlias.includes(phoneticInput))) {
          return loc;
        }
      }
    }
  }

  // 4. Fuzzy Levenshtein edit distance <= 2 on normalized token level
  const inputTokens = normalizedInput.split(' ').filter(Boolean);
  const inputPhoneticTokens = phoneticInput.split(' ').filter(Boolean);

  for (const loc of locations) {
    const candidateNames = [loc.name, ...(loc.aliases || [])];
    for (const cand of candidateNames) {
      const candNorm = normalizeText(cand);
      const candTokens = candNorm.split(' ').filter(Boolean);

      // Check full edit distance if strings are short
      if (candNorm && normalizedInput) {
        if (levenshteinDistance(normalizedInput, candNorm) <= 2) {
          return loc;
        }
      }

      // Check token-by-token edit distance
      for (const inToken of inputTokens) {
        for (const candToken of candTokens) {
          if (inToken.length >= 3 && candToken.length >= 3) {
            if (levenshteinDistance(inToken, candToken) <= 2) {
              return loc;
            }
          }
        }
      }

      // Check phonetic token edit distance
      const candPhonetic = phoneticNormalize(cand);
      const candPhoneticTokens = candPhonetic.split(' ').filter(Boolean);
      for (const inToken of inputPhoneticTokens) {
        for (const candToken of candPhoneticTokens) {
          if (inToken.length >= 3 && candToken.length >= 3) {
            if (levenshteinDistance(inToken, candToken) <= 2) {
              return loc;
            }
          }
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
