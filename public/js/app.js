/**
 * Relay Frontend Engine
 * Vanilla JS + Leaflet map integration
 * D3b Safe Rendering, Accessibility, Map & Print Fixes
 */

// Global Application State
let casesData = [];
let selectedCaseId = null;
let map = null;
const markersMap = new Map();
let userInteractingWithMap = false;
let previousCaseIds = '';
let isUsingFixtures = false;
let isApiError = false;
let pollIntervalId = null;

// Helper: Safe HTML escaping helper to prevent XSS
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Helper: Stage color class mapping
function getStageColorClass(status) {
  switch (status) {
    case 'Signal':
    case 'Corroborating':
      return 'pin-grey';
    case 'Verified':
    case 'Assigned':
      return 'pin-amber';
    case 'Accepted':
    case 'In Progress':
      return 'pin-blue';
    case 'Claimed Resolved':
    case 'Independently Verified':
      return 'pin-green';
    default:
      return 'pin-grey';
  }
}

function getBadgeColorClass(status) {
  switch (status) {
    case 'Signal':
    case 'Corroborating':
      return 'status-stage-grey';
    case 'Verified':
    case 'Assigned':
      return 'status-stage-amber';
    case 'Accepted':
    case 'In Progress':
      return 'status-stage-blue';
    case 'Claimed Resolved':
    case 'Independently Verified':
      return 'status-stage-green';
    default:
      return 'status-stage-grey';
  }
}

// Stage SVG Icon per stage (Accessible without color alone)
function getStageIconSvg(status) {
  switch (status) {
    case 'Signal':
    case 'Corroborating':
      return `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="8"/></svg>`;
    case 'Verified':
    case 'Assigned':
      return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
    case 'Accepted':
    case 'In Progress':
      return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
    case 'Claimed Resolved':
    case 'Independently Verified':
      return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`;
    default:
      return `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="8"/></svg>`;
  }
}

// Parse SLA string to minutes
function parseSlaMinutes(slaStr) {
  if (!slaStr) return Infinity;
  const match = String(slaStr).match(/(\d+)\s*(min|minute|hour|hr|day)/i);
  if (!match) return Infinity;
  const num = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  if (unit.startsWith('min')) return num;
  if (unit.startsWith('hour') || unit.startsWith('hr')) return num * 60;
  if (unit.startsWith('day')) return num * 24 * 60;
  return num;
}

// Format Acknowledged string
function formatAcknowledged(c) {
  const ackAfterMins = c.acknowledged_after_minutes;
  const ackAt = c.acknowledged_at;
  const slaMins = parseSlaMinutes(c.sla);

  let mins = null;
  if (ackAfterMins !== null && ackAfterMins !== undefined) {
    mins = Number(ackAfterMins);
  } else if (ackAt && c.created_at) {
    const diff = new Date(ackAt) - new Date(c.created_at);
    mins = Math.max(0, Math.round(diff / 60000));
  }

  if (mins === null || isNaN(mins)) {
    return 'Not yet acknowledged';
  }

  const isSlaMet = mins <= slaMins;
  const statusNote = isSlaMet ? 'SLA met ✓' : 'SLA missed';
  return `${mins} minutes after report — ${statusNote}`;
}

// Filter evidence array to exclude independent_verification items and duplicates by normalized text
function getFilteredEvidence(evidenceArr) {
  if (!Array.isArray(evidenceArr)) return [];
  const items = [];
  const seenTexts = new Set();

  evidenceArr.forEach(item => {
    if (!item) return;
    if (typeof item === 'object' && item.type === 'independent_verification') {
      return; // exclude from normal evidence count
    }
    const textStr = typeof item === 'object' ? (item.transcript || item.text || '') : String(item);
    const normText = textStr.trim().toLowerCase();
    if (normText && !seenTexts.has(normText)) {
      seenTexts.add(normText);
      items.push(item);
    }
  });

  return items;
}

// Initialize Leaflet Map
function initMap() {
  if (map) return;

  // Default centered at Lagos, Nigeria
  map = L.map('map').setView([6.5244, 3.3792], 11);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  const setInteracting = () => { userInteractingWithMap = true; };
  map.on('dragstart', setInteracting);
  map.on('zoomstart', setInteracting);
  map.on('movestart', setInteracting);

  let userTimer;
  map.on('moveend', () => {
    clearTimeout(userTimer);
    userTimer = setTimeout(() => { userInteractingWithMap = false; }, 8000);
  });
}

// Update or place map markers for cases
function updateMapMarkers(cases) {
  if (!map) return;

  const currentIds = new Set();
  const validBoundsPoints = [];

  cases.forEach(c => {
    if (c.lat && c.lng) {
      currentIds.add(c.id);
      validBoundsPoints.push([c.lat, c.lng]);

      const colorClass = getStageColorClass(c.status);
      const isHighSeverity = c.severity === 'High';
      const iconSvg = getStageIconSvg(c.status);

      const customIcon = L.divIcon({
        className: `custom-map-marker ${isHighSeverity ? 'high-severity-pulse' : ''}`,
        html: `<div class="marker-pin ${colorClass}" title="Case ${escapeHtml(c.id)}: ${escapeHtml(c.status)}" aria-label="Case ${escapeHtml(c.id)}: ${escapeHtml(c.status)}">${iconSvg}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      const popupHtml = `
        <div class="map-popup-content" style="font-size: 0.85rem; line-height: 1.4;">
          <strong>${escapeHtml(c.id)}: ${escapeHtml(c.type || 'Incident')}</strong><br/>
          <span style="font-size: 0.75rem; color: #4b5563;">${escapeHtml(c.location_text || 'Lagos')}</span><br/>
          <span class="badge ${getBadgeColorClass(c.status)}" style="margin-top:4px; display:inline-block;">${escapeHtml(c.status)}</span><br/>
          <button type="button" class="popup-receipt-btn" aria-label="View Trust Receipt for Case ${escapeHtml(c.id)}" onclick="handleViewReceipt('${escapeHtml(c.id)}')">View Receipt</button>
        </div>
      `;

      if (markersMap.has(c.id)) {
        const marker = markersMap.get(c.id);
        marker.setLatLng([c.lat, c.lng]);
        marker.setIcon(customIcon);
        marker.setPopupContent(popupHtml);
      } else {
        const marker = L.marker([c.lat, c.lng], { icon: customIcon }).addTo(map);
        marker.bindPopup(popupHtml);
        markersMap.set(c.id, marker);
      }
    }
  });

  // Remove markers no longer present
  markersMap.forEach((marker, id) => {
    if (!currentIds.has(id)) {
      map.removeLayer(marker);
      markersMap.delete(id);
    }
  });

  // Fit bounds on load / material change when user is not actively interacting
  const currentCaseIdsKey = Array.from(currentIds).sort().join(',');
  if (validBoundsPoints.length > 0 && currentCaseIdsKey !== previousCaseIds && !userInteractingWithMap) {
    previousCaseIds = currentCaseIdsKey;
    if (validBoundsPoints.length === 1) {
      map.setView(validBoundsPoints[0], 12);
    } else {
      map.fitBounds(validBoundsPoints, { padding: [30, 30], maxZoom: 14 });
    }
  }
}

// View Receipt Popup Handler
function handleViewReceipt(caseId) {
  const marker = markersMap.get(caseId);
  if (marker) {
    marker.closePopup();
  }
  selectCase(caseId, { scrollToReceipt: true });
}

// Fetch Cases API or Fixtures
async function fetchCases() {
  const urlParams = new URLSearchParams(window.location.search);
  const wantsFixtures = urlParams.get('fixtures') === '1';

  const sampleBadge = document.getElementById('sample-data-badge');
  const errorBanner = document.getElementById('error-banner');

  if (wantsFixtures) {
    isUsingFixtures = true;
    if (sampleBadge) sampleBadge.classList.remove('hidden');
    await loadFallbackFixtures();
    renderUI();
    return;
  } else {
    if (sampleBadge) sampleBadge.classList.add('hidden');
  }

  try {
    const res = await fetch('/api/cases');
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();

    if (errorBanner) errorBanner.classList.add('hidden');
    isApiError = false;

    if (Array.isArray(data.cases)) {
      casesData = data.cases;
    } else if (Array.isArray(data)) {
      casesData = data;
    } else {
      casesData = [];
    }
  } catch (err) {
    console.warn('[Relay UI] API fetch failed:', err.message);
    isApiError = true;
    if (errorBanner) errorBanner.classList.remove('hidden');
  }

  renderUI();
}

// Load Fallback Fixtures
async function loadFallbackFixtures() {
  try {
    const res = await fetch('/fixtures/cases.json');
    if (res.ok) {
      casesData = await res.json();
    }
  } catch (err) {
    console.error('[Relay UI] Failed to load fixture cases.json:', err);
  }
}

// Render UI Components
function renderUI() {
  const searchQuery = (document.getElementById('feed-search').value || '').toLowerCase().trim();

  // Filter cases by search query
  const filteredCases = casesData.filter(c => {
    const textStr = `${c.id} ${c.type || ''} ${c.location_text || ''} ${c.status || ''} ${c.responsible_actor || ''} ${Array.isArray(c.evidence) ? JSON.stringify(c.evidence) : ''}`.toLowerCase();
    return textStr.includes(searchQuery);
  });

  document.getElementById('case-count-badge').textContent = `${filteredCases.length} Case${filteredCases.length !== 1 ? 's' : ''}`;

  if (filteredCases.length > 0) {
    if (!selectedCaseId || !casesData.some(c => c.id === selectedCaseId)) {
      selectedCaseId = filteredCases[0].id;
    }
  } else {
    selectedCaseId = null;
  }

  renderFeedList(filteredCases);
  updateMapMarkers(casesData);
  renderTrustReceipt();
}

// Render Feed List Cards safely
function renderFeedList(cases) {
  const feedContainer = document.getElementById('case-feed-list');

  if (isApiError && cases.length === 0) {
    feedContainer.innerHTML = '<div class="empty-state" role="alert">Cannot reach the server — retrying...</div>';
    return;
  }

  if (cases.length === 0) {
    feedContainer.innerHTML = '<div class="empty-state">No reports yet — submit one above.</div>';
    return;
  }

  feedContainer.innerHTML = cases.map(c => {
    const isSelected = c.id === selectedCaseId;
    const badgeClass = getBadgeColorClass(c.status);
    const severityClass = c.severity ? `severity-${escapeHtml(c.severity.toLowerCase())}` : '';
    const isFallback = c.classified_by === 'fallback';

    return `
      <div class="case-item ${isSelected ? 'selected' : ''}"
           tabindex="0"
           role="button"
           aria-pressed="${isSelected}"
           onclick="selectCase('${escapeHtml(c.id)}')"
           onkeydown="if(event.key==='Enter'||event.key===' '){selectCase('${escapeHtml(c.id)}'); event.preventDefault();}">
        <div class="case-item-header">
          <span class="case-id">${escapeHtml(c.id)}</span>
          <span class="badge ${badgeClass}">${escapeHtml(c.status)}</span>
        </div>
        ${isFallback ? `
          <div style="margin-top:2px;">
            <span class="badge badge-fallback" title="Keyword estimate — AI classification unavailable">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              Keyword estimate — AI classification unavailable
            </span>
          </div>
        ` : ''}
        <div class="case-item-body">
          <strong>${escapeHtml(c.type || 'Incident')}</strong>: ${escapeHtml(c.location_text || c.raw_report || 'Location unverified')}
        </div>
        <div class="case-item-footer">
          <span class="${severityClass}">${escapeHtml(c.severity ? c.severity + ' Severity' : 'Normal')}</span>
          <span>Score: ${Number(c.confidence_score ?? 0)}%</span>
        </div>
      </div>
    `;
  }).join('');
}

// Select a Case
function selectCase(id, options = {}) {
  selectedCaseId = id;
  renderUI();

  // Focus map on selected case if lat/lng exists and map is ready
  const selectedCase = casesData.find(c => c.id === id);
  if (selectedCase && selectedCase.lat && selectedCase.lng && map) {
    const currentZoom = map.getZoom();
    const targetZoom = Math.min(currentZoom < 13 ? 14 : currentZoom, 15);
    map.setView([selectedCase.lat, selectedCase.lng], targetZoom, { animate: true });
    const marker = markersMap.get(id);
    if (marker) {
      marker.openPopup();
    }
  }

  // Set document title
  document.title = "Relay — Trust Receipt";

  // Scroll receipt into view & focus heading if requested
  if (options.scrollToReceipt) {
    const receiptPanel = document.getElementById('receipt-container');
    if (receiptPanel) {
      receiptPanel.scrollTop = 0;
      receiptPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const heading = receiptPanel.querySelector('#receipt-heading');
      if (heading) {
        heading.focus();
      }
      const card = receiptPanel.querySelector('.receipt-card');
      if (card) {
        card.classList.remove('receipt-highlight');
        void card.offsetWidth; // trigger reflow
        card.classList.add('receipt-highlight');
      }
    }
  }
}

// Render Trust Receipt Component safely
function renderTrustReceipt() {
  const container = document.getElementById('receipt-container');
  const caseRecord = casesData.find(c => c.id === selectedCaseId);

  if (!caseRecord) {
    container.innerHTML = '<div class="loading-state">Select a case from the feed to view its Trust Receipt.</div>';
    return;
  }

  const isIndependentlyVerified = caseRecord.status === 'Independently Verified';
  const isClosed = isIndependentlyVerified || caseRecord.closed === true;
  const badgeClass = getBadgeColorClass(caseRecord.status);

  // Evidence calculation
  const filteredEvidence = getFilteredEvidence(caseRecord.evidence);
  const evidenceCount = filteredEvidence.length;

  const hasVoice = Boolean(
    caseRecord.transcript ||
    (Array.isArray(caseRecord.evidence) && caseRecord.evidence.some(e => typeof e === 'object' && (e.type === 'voice' || e.transcript)))
  );
  const hasGeo = Boolean(caseRecord.lat && caseRecord.lng);

  const ackText = formatAcknowledged(caseRecord);

  // Action field
  let actionText = caseRecord.action;
  if (!actionText) {
    if (caseRecord.status === 'Verified') actionText = 'Awaiting assignment';
    else if (['Signal', 'Corroborating'].includes(caseRecord.status)) actionText = 'Awaiting corroboration';
    else actionText = 'Report received and queued';
  }

  // Resolution field
  let resolutionText = caseRecord.resolution;
  if (!resolutionText) {
    if (isIndependentlyVerified || caseRecord.independent_verification) {
      resolutionText = 'Independently Verified';
    } else if (caseRecord.status === 'Claimed Resolved') {
      resolutionText = 'Claimed';
    } else {
      resolutionText = 'Pending';
    }
  }

  // Responsible actor proposed tag if before Assigned
  const isBeforeAssigned = ['Signal', 'Corroborating', 'Verified'].includes(caseRecord.status);
  const actorName = escapeHtml(caseRecord.responsible_actor || 'Unassigned');
  const actorLabel = isBeforeAssigned ? `${actorName} <span style="font-size:0.8rem; color:var(--text-muted); font-weight:normal;">(proposed)</span>` : actorName;

  // Independent verification block details
  let ivText = null;
  let ivTimeText = null;
  if (caseRecord.independent_verification) {
    if (typeof caseRecord.independent_verification === 'object') {
      ivText = caseRecord.independent_verification.text;
      const tMin = caseRecord.independent_verification.t_plus_minutes;
      if (tMin !== undefined && tMin !== null) {
        ivTimeText = `confirmed by an independent community report, T+${tMin} min`;
      }
    } else {
      ivText = String(caseRecord.independent_verification);
      ivTimeText = 'confirmed by an independent community report';
    }
  }

  // Badges
  const badges = [];
  if (caseRecord.classified_by === 'fallback') {
    badges.push(`
      <span class="badge badge-fallback" title="Keyword estimate — AI classification unavailable">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        Keyword estimate — AI classification unavailable
      </span>
    `);
  }
  if (caseRecord.demo_scripted) badges.push('<span class="badge badge-demo"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg> Scripted demo routing</span>');
  if (caseRecord.demo_seed) badges.push('<span class="badge badge-demo"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> Seeded sample</span>');
  if (caseRecord.ack_simulated) badges.push('<span class="badge badge-demo"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/></svg> Simulated responder timeline</span>');

  const historyItems = Array.isArray(caseRecord.history) ? caseRecord.history : [];

  container.innerHTML = `
    <div class="receipt-card">
      <div class="receipt-header">
        <div>
          <h3 id="receipt-heading" class="receipt-title" tabindex="-1">Trust Receipt</h3>
          <div class="receipt-id">${escapeHtml(caseRecord.id)}</div>
          ${badges.length > 0 ? `<div class="receipt-badges">${badges.join(' ')}</div>` : ''}
        </div>
        <button onclick="window.print()" class="btn btn-secondary btn-sm btn-print" title="Print Trust Receipt" aria-label="Print Trust Receipt">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          Print
        </button>
      </div>

      <div class="receipt-field-grid">
        <div class="receipt-field">
          <span class="field-label">Case ID</span>
          <span class="field-value">${escapeHtml(caseRecord.id)}</span>
        </div>

        <div class="receipt-field">
          <span class="field-label">Status</span>
          <span class="field-value">
            <span class="badge ${badgeClass}">${escapeHtml(caseRecord.status)}</span>
          </span>
        </div>

        <div class="receipt-field full-width">
          <span class="field-label">Evidence</span>
          <span class="field-value">
            ${evidenceCount} independent report${evidenceCount !== 1 ? 's' : ''}
            <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: normal;">
              (${hasGeo ? 'geolocation tagged' : 'no GPS'}, ${hasVoice ? 'voice media' : 'text signal'})
            </span>
          </span>
          <div class="evidence-box" style="margin-top: 6px;">
            ${filteredEvidence.map(ev => {
              const isVoiceObj = typeof ev === 'object' && (ev.type === 'voice' || ev.transcript);
              const textStr = typeof ev === 'object' ? (ev.transcript || ev.text) : String(ev);
              return `
                <div class="evidence-item">
                  "${escapeHtml(textStr)}"
                  ${isVoiceObj ? `
                    <br/><span style="font-size: 0.75rem; color: var(--text-muted); font-weight: normal;">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                      Auto-transcribed — may contain errors
                    </span>
                  ` : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div class="receipt-field">
          <span class="field-label">Responsible Actor</span>
          <span class="field-value">${actorLabel}</span>
        </div>

        <div class="receipt-field">
          <span class="field-label">SLA</span>
          <span class="field-value">${escapeHtml(caseRecord.sla || 'N/A')}</span>
        </div>

        <div class="receipt-field full-width">
          <span class="field-label">Acknowledged</span>
          <span class="field-value" style="color: ${ackText.includes('SLA met') ? 'var(--status-green)' : (ackText.includes('SLA missed') ? 'var(--severity-high)' : 'inherit')}">
            ${escapeHtml(ackText)}
          </span>
        </div>

        <div class="receipt-field full-width">
          <span class="field-label">Action</span>
          <span class="field-value">${escapeHtml(actionText)}</span>
        </div>

        <div class="receipt-field">
          <span class="field-label">Resolution</span>
          <span class="field-value" style="color: ${resolutionText === 'Independently Verified' ? 'var(--status-green)' : 'inherit'}">
            ${escapeHtml(resolutionText)}
          </span>
        </div>

        <div class="receipt-field">
          <span class="field-label">Closed</span>
          <span class="field-value">
            <strong style="color: ${isClosed ? 'var(--status-green)' : 'var(--text-muted)'}">${isClosed ? 'Yes' : 'No'}</strong>
          </span>
        </div>
      </div>

      ${ivText ? `
        <div class="independent-verif-box">
          <strong>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
            Independent Verification
          </strong>
          <div style="margin-top: 4px;">"${escapeHtml(ivText)}"</div>
          ${ivTimeText ? `<div style="font-size: 0.78rem; opacity: 0.85; margin-top: 2px; font-weight: 600;">— ${escapeHtml(ivTimeText)}</div>` : ''}
        </div>
      ` : ''}

      <!-- History Timeline -->
      <div class="timeline-container">
        <span class="field-label">Verification & Lifecycle Timeline</span>
        <ul class="timeline" style="margin-top: 8px;">
          ${historyItems.map(item => {
            const timeStr = item.at ? new Date(item.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
            const tPlusStr = item.t_plus_minutes !== undefined && item.t_plus_minutes !== null ? ` (T+${item.t_plus_minutes} min)` : '';
            return `
              <li class="timeline-item">
                <div>
                  <strong class="badge ${getBadgeColorClass(item.status)}">${escapeHtml(item.status)}</strong>
                  <span class="timeline-time">${escapeHtml(timeStr)}${escapeHtml(tPlusStr)}</span>
                </div>
                <div class="timeline-note">${escapeHtml(item.note)}</div>
              </li>
            `;
          }).join('')}
        </ul>
      </div>
    </div>
  `;
}

// Setup Form Submission & Events
function setupFormHandlers() {
  const form = document.getElementById('report-form');
  const feedbackEl = document.getElementById('form-feedback');
  const locationBtn = document.getElementById('use-location-btn');

  // GPS Location detector
  locationBtn.addEventListener('click', () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          document.getElementById('report-lat').value = pos.coords.latitude.toFixed(4);
          document.getElementById('report-lng').value = pos.coords.longitude.toFixed(4);
          locationBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg> Location Set';
        },
        err => {
          alert('Could not retrieve browser GPS location.');
        }
      );
    } else {
      alert('Geolocation is not supported by your browser.');
    }
  });

  document.getElementById('feed-search').addEventListener('input', () => {
    renderUI();
  });

  // Intake Form Submit Event
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const text = document.getElementById('report-text').value.trim();
    const lat = document.getElementById('report-lat').value;
    const lng = document.getElementById('report-lng').value;
    const audioInput = document.getElementById('report-audio');
    const hasAudio = audioInput.files && audioInput.files.length > 0;

    if (!text && !hasAudio) {
      feedbackEl.className = 'form-feedback error';
      feedbackEl.textContent = 'Please enter text or select a voice file.';
      feedbackEl.classList.remove('hidden');
      return;
    }

    feedbackEl.className = 'form-feedback';
    feedbackEl.textContent = 'Submitting report to Relay engine...';
    feedbackEl.classList.remove('hidden');

    try {
      let res;
      if (hasAudio) {
        const formData = new FormData();
        formData.append('audio', audioInput.files[0]);
        if (text) formData.append('text', text);
        if (lat) formData.append('lat', lat);
        if (lng) formData.append('lng', lng);

        res = await fetch('/api/reports/voice', {
          method: 'POST',
          body: formData
        });
      } else {
        res = await fetch('/api/reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            lat: lat ? Number(lat) : undefined,
            lng: lng ? Number(lng) : undefined
          })
        });
      }

      const data = await res.json().catch(() => ({}));

      if (res.status === 429) {
        feedbackEl.className = 'form-feedback error';
        feedbackEl.textContent = 'Too many reports from this device, try again in a few minutes';
        return;
      }

      if (res.status === 502 || data.error === 'transcription_failed') {
        feedbackEl.className = 'form-feedback error';
        feedbackEl.textContent = 'We could not process that audio — please try again or type the report';
        return;
      }

      if (res.ok && data.duplicate) {
        feedbackEl.className = 'form-feedback info';
        feedbackEl.textContent = data.note || 'Duplicate report received.';
        form.reset();
        return;
      }

      if (res.ok && data.case) {
        feedbackEl.className = 'form-feedback success';
        feedbackEl.textContent = `Report processed! Case ${data.case.id} (${data.case.status}).`;
        form.reset();
        locationBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/></svg> Get GPS';

        selectedCaseId = data.case.id;
        await fetchCases();
      } else if (res.ok && data.case === null) {
        feedbackEl.className = 'form-feedback info';
        feedbackEl.textContent = data.note || 'That message does not look like an incident report.';
      } else {
        feedbackEl.className = 'form-feedback error';
        feedbackEl.textContent = data.error || 'Failed to submit report';
      }
    } catch (err) {
      console.error('[Submit Error]', err);
      feedbackEl.className = 'form-feedback error';
      feedbackEl.textContent = `Error: ${err.message}`;
    }
  });
}

// Manage polling interval
function setupPolling() {
  fetchCases();

  pollIntervalId = setInterval(() => {
    if (!document.hidden) {
      fetchCases();
    }
  }, 5000);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      fetchCases();
    }
  });
}

// App Initialization
window.addEventListener('DOMContentLoaded', () => {
  initMap();
  setupFormHandlers();
  setupPolling();
});
