/**
 * Confidence scoring constants object.
 * Weighted heuristic (0-100) per BUILD_BRIEF §4.
 */
const CONFIDENCE_WEIGHTS = {
  BASE_SCORE: 40,
  CORROBORATING_REPORT: 30,
  GEOSPATIAL_CONSISTENCY: 15,
  MEDIA_EVIDENCE: 15,
  NO_CONTRADICTING_REPORT: 10
};

/**
 * Calculates confidence score (0-100) based on weighted signals.
 * A single report's score is capped at 45.
 * @param {Object} options
 * @param {number} options.corroboratingCount Number of additional matching reports
 * @param {boolean} options.hasGeospatial Verified lat/lng or gazetteer match
 * @param {boolean} options.hasMedia Presence of voice transcript or attached media
 * @param {boolean} options.hasContradiction Presence of contradictory signals
 * @returns {number} Score from 0 to 100
 */
function calculateConfidenceScore({
  corroboratingCount = 0,
  hasGeospatial = false,
  hasMedia = false,
  hasContradiction = false
}) {
  let score = CONFIDENCE_WEIGHTS.BASE_SCORE;

  if (corroboratingCount > 0) {
    score += CONFIDENCE_WEIGHTS.CORROBORATING_REPORT * Math.min(corroboratingCount, 2);
  }

  if (hasGeospatial) {
    score += CONFIDENCE_WEIGHTS.GEOSPATIAL_CONSISTENCY;
  }

  if (hasMedia) {
    score += CONFIDENCE_WEIGHTS.MEDIA_EVIDENCE;
  }

  if (!hasContradiction) {
    score += CONFIDENCE_WEIGHTS.NO_CONTRADICTING_REPORT;
  } else {
    score -= 20;
  }

  score = Math.min(100, Math.max(0, Math.round(score)));

  // Single unverified report must be capped at 45
  if (corroboratingCount === 0) {
    return Math.min(45, score);
  }

  // Unverified multi-report case must never exceed 95
  return Math.min(95, score);
}

module.exports = {
  CONFIDENCE_WEIGHTS,
  calculateConfidenceScore
};
