const CONFIDENCE_WEIGHTS = {
  BASE_SIGNAL: 20,        // Valid report signal
  CORROBORATION: 25,      // Corroborating reports for same type + location within 60 min
  GEOSPATIAL: 25,         // Geospatial consistency (valid lat/lng matched from gazetteer or report)
  MEDIA_EVIDENCE: 15,     // Media evidence present (e.g. voice/photo attached)
  NO_CONTRADICTION: 15    // Absence of contradictory report
};

/**
 * Calculates a confidence score (0 - 100) based on heuristic weights.
 *
 * @param {Object} params
 * @param {number} params.corroborationCount - Number of total reports for this case
 * @param {boolean} params.geoConsistent - Whether lat/lng geospatial location is verified
 * @param {boolean} params.mediaPresent - Whether voice or photo media is attached
 * @param {boolean} params.hasContradiction - Whether there are contradictory reports
 * @returns {number} Score from 0 to 100
 */
function calculateConfidenceScore({
  corroborationCount = 1,
  geoConsistent = false,
  mediaPresent = false,
  hasContradiction = false
}) {
  let score = CONFIDENCE_WEIGHTS.BASE_SIGNAL;

  if (corroborationCount > 1) {
    score += CONFIDENCE_WEIGHTS.CORROBORATION;
  }

  if (geoConsistent) {
    score += CONFIDENCE_WEIGHTS.GEOSPATIAL;
  }

  if (mediaPresent) {
    score += CONFIDENCE_WEIGHTS.MEDIA_EVIDENCE;
  }

  if (!hasContradiction) {
    score += CONFIDENCE_WEIGHTS.NO_CONTRADICTION;
  }

  return Math.min(100, Math.max(0, score));
}

module.exports = {
  CONFIDENCE_WEIGHTS,
  calculateConfidenceScore
};
