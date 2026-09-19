/**
 * Relay Frontend Engine
 * Vanilla JS + Leaflet map integration
 * D2 Polish & Accessibility
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

// Parse SLA string (e.g. "30 minutes", "2 hours", "48 hours") to minutes
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

// Format Acknowledged string as required by spec:
// "22 minutes after report — SLA met ✓" or "SLA missed"
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

// Initialize Leaflet Map
function initMap() {
  if (map) return;

  // Default centered at Lagos, Nigeria
  map = L.map('map').setView([6.5244, 3.3792], 11);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  // Track map interaction so auto-zoom fitBounds doesn't disrupt user panning/zooming
  const setInteracting = () => { userInteractingWithMap = true; };
  map.on('dragstart', setInteracting);
  map.on('zoomstart', setInteracting);
  map.on('movestart', setInteracting);

  // Reset interaction flag after inactivity
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

      const customIcon = L.divIcon({
        className: `custom-map-marker ${isHighSeverity ? 'high-severity-pulse' : ''}`,
        html: `<div class="marker-pin ${colorClass}" title="${c.id}: ${c.status}"></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      const popupHtml = `
        <div class="map-popup-content" style="font-size: 0.85rem; line-height: 1.4;">
          <strong>${c.id}: ${c.type || 'Incident'}</strong><br/>
          <span style="font-size: 0.75rem; color: #4b5563;">${c.location_text || 'Lagos'}</span><br/>
          <span class="badge ${getBadgeColorClass(c.status)}" style="margin-top:4px; display:inline-block;">${c.status}</span><br/>
          <button class="popup-receipt-btn" onclick="selectCase('${c.id}')">View Receipt</button>
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

  // Fit bounds if case set changed materially and user is not currently interacting with the map
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

// Load Fallback Fixtures (Only when ?fixtures=1)
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
    const textStr = `${c.id} ${c.type} ${c.location_text} ${c.status} ${c.responsible_actor} ${Array.isArray(c.evidence) ? c.evidence.join(' ') : ''}`.toLowerCase();
    return textStr.includes(searchQuery);
  });

  // Update Case Count Badge
  document.getElementById('case-count-badge').textContent = `${filteredCases.length} Case${filteredCases.length !== 1 ? 's' : ''}`;

  // Keep existing selection if valid, or default to first
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

// Render Feed List Cards
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
    const severityClass = c.severity ? `severity-${c.severity.toLowerCase()}` : '';

    return `
      <div class="case-item ${isSelected ? 'selected' : ''}"
           tabindex="0"
           role="button"
           aria-pressed="${isSelected}"
           onclick="selectCase('${c.id}')"
           onkeydown="if(event.key==='Enter'||event.key===' '){selectCase('${c.id}'); event.preventDefault();}">
        <div class="case-item-header">
          <span class="case-id">${c.id}</span>
          <span class="badge ${badgeClass}">${c.status}</span>
        </div>
        <div class="case-item-body">
          <strong>${c.type || 'Incident'}</strong>: ${c.location_text || c.raw_report || 'Location unverified'}
        </div>
        <div class="case-item-footer">
          <span class="${severityClass}">${c.severity ? c.severity + ' Severity' : 'Normal'}</span>
          <span>Score: ${c.confidence_score ?? 0}%</span>
        </div>
      </div>
    `;
  }).join('');
}

// Select a Case
function selectCase(id) {
  selectedCaseId = id;
  renderUI();

  // Focus map on selected case if lat/lng exists and map is ready
  const selectedCase = casesData.find(c => c.id === id);
  if (selectedCase && selectedCase.lat && selectedCase.lng && map) {
    const marker = markersMap.get(id);
    if (marker) {
      marker.openPopup();
    }
  }
}

// Render Trust Receipt Component
function renderTrustReceipt() {
  const container = document.getElementById('receipt-container');
  const caseRecord = casesData.find(c => c.id === selectedCaseId);

  if (!caseRecord) {
    container.innerHTML = '<div class="loading-state">Select a case from the feed to view its Trust Receipt.</div>';
    return;
  }

  // Closed rule: Yes ONLY at Independently Verified (or explicitly caseRecord.closed === true)
  const isIndependentlyVerified = caseRecord.status === 'Independently Verified';
  const isClosed = isIndependentlyVerified || caseRecord.closed === true;

  const badgeClass = getBadgeColorClass(caseRecord.status);

  // Evidence count = corroborating reports only
  const evidenceCount = Array.isArray(caseRecord.evidence) ? caseRecord.evidence.length : 0;
  const hasVoice = caseRecord.transcript || (Array.isArray(caseRecord.evidence) && caseRecord.evidence.some(e => typeof e === 'object' && e.type === 'voice'));
  const hasGeo = Boolean(caseRecord.lat && caseRecord.lng);

  // SLA & Acknowledged formatted according to spec
  const ackText = formatAcknowledged(caseRecord);

  // Action field: show action field, never scripted history notes
  let actionText = caseRecord.action;
  if (!actionText) {
    // Fallback default action
    actionText = 'Report received and queued';
  }

  // Resolution field: "Pending" / "Claimed" / "Independently Verified"
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

  // Badges to render
  const badges = [];
  if (caseRecord.demo_scripted) badges.push('<span class="badge badge-demo"><i class="fa-solid fa-code"></i> Scripted demo routing</span>');
  if (caseRecord.demo_seed) badges.push('<span class="badge badge-demo"><i class="fa-solid fa-seedling"></i> Seeded sample</span>');
  if (caseRecord.ack_simulated) badges.push('<span class="badge badge-demo"><i class="fa-solid fa-robot"></i> Simulated responder timeline</span>');

  // History timeline
  const historyItems = Array.isArray(caseRecord.history) ? caseRecord.history : [];

  container.innerHTML = `
    <div class="receipt-card">
      <div class="receipt-header">
        <div>
          <div class="field-label">Trust Receipt</div>
          <div class="receipt-id">${caseRecord.id}</div>
          ${badges.length > 0 ? `<div class="receipt-badges">${badges.join(' ')}</div>` : ''}
        </div>
        <button onclick="window.print()" class="btn btn-secondary btn-sm btn-print" title="Print Trust Receipt" aria-label="Print Trust Receipt">
          <i class="fa-solid fa-print" aria-hidden="true"></i> Print
        </button>
      </div>

      <div class="receipt-field-grid">
        <div class="receipt-field">
          <span class="field-label">Case ID</span>
          <span class="field-value">${caseRecord.id}</span>
        </div>

        <div class="receipt-field">
          <span class="field-label">Status</span>
          <span class="field-value">
            <span class="badge ${badgeClass}">${caseRecord.status}</span>
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
            ${(caseRecord.evidence || []).map(ev => {
              const textStr = typeof ev === 'object' ? (ev.transcript || ev.text) : ev;
              return `<div class="evidence-item">"${textStr}"</div>`;
            }).join('')}
          </div>
        </div>

        <div class="receipt-field">
          <span class="field-label">Responsible Actor</span>
          <span class="field-value">${caseRecord.responsible_actor || 'Unassigned'}</span>
        </div>

        <div class="receipt-field">
          <span class="field-label">SLA</span>
          <span class="field-value">${caseRecord.sla || 'N/A'}</span>
        </div>

        <div class="receipt-field full-width">
          <span class="field-label">Acknowledged</span>
          <span class="field-value" style="color: ${ackText.includes('SLA met') ? 'var(--status-green)' : (ackText.includes('SLA missed') ? 'var(--severity-high)' : 'inherit')}">
            ${ackText}
          </span>
        </div>

        <div class="receipt-field full-width">
          <span class="field-label">Action</span>
          <span class="field-value">${actionText}</span>
        </div>

        <div class="receipt-field">
          <span class="field-label">Resolution</span>
          <span class="field-value" style="color: ${resolutionText === 'Independently Verified' ? 'var(--status-green)' : 'inherit'}">
            ${resolutionText}
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
          <strong><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Independent Verification</strong>
          <div style="margin-top: 4px;">"${ivText}"</div>
          ${ivTimeText ? `<div style="font-size: 0.78rem; opacity: 0.85; margin-top: 2px; font-weight: 600;">— ${ivTimeText}</div>` : ''}
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
                  <strong class="badge ${getBadgeColorClass(item.status)}">${item.status}</strong>
                  <span class="timeline-time">${timeStr}${tPlusStr}</span>
                </div>
                <div class="timeline-note">${item.note}</div>
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
          locationBtn.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i> Location Set';
        },
        err => {
          alert('Could not retrieve browser GPS location.');
        }
      );
    } else {
      alert('Geolocation is not supported by your browser.');
    }
  });

  // Search input filter event
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
        // Voice file upload via FormData to /api/reports/voice
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
        // Text report via JSON to /api/reports
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

      if (res.ok && data.case) {
        feedbackEl.className = 'form-feedback success';
        feedbackEl.textContent = `Report processed! Case ${data.case.id} (${data.case.status}).`;
        form.reset();
        locationBtn.innerHTML = '<i class="fa-solid fa-location-crosshairs" aria-hidden="true"></i> Get GPS';

        // Select the returned case immediately
        selectedCaseId = data.case.id;
        await fetchCases();
      } else if (res.ok && data.case === null) {
        feedbackEl.className = 'form-feedback error';
        feedbackEl.textContent = 'That message does not look like an incident report';
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

// Manage polling interval and pause when tab is hidden
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
