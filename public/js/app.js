/**
 * Relay Frontend Engine
 * Vanilla JS + Leaflet map integration
 */

// Global Application State
let casesData = [];
let selectedCaseId = null;
let map = null;
const markersMap = new Map();

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

// Helper: Calculate time elapsed string
function timeElapsed(timestamp) {
  if (!timestamp) return 'Not yet acknowledged';
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = Math.max(0, now - date);
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
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
}

// Update or place map markers for cases
function updateMapMarkers(cases) {
  if (!map) return;

  const currentIds = new Set();

  cases.forEach(c => {
    if (c.lat && c.lng) {
      currentIds.add(c.id);
      const colorClass = getStageColorClass(c.status);
      const isHighSeverity = c.severity === 'High';

      const customIcon = L.divIcon({
        className: `custom-map-marker ${isHighSeverity ? 'high-severity-pulse' : ''}`,
        html: `<div class="marker-pin ${colorClass}"></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      const popupHtml = `
        <div class="map-popup-content" style="font-size: 0.85rem; line-height: 1.4;">
          <strong>${c.id}: ${c.type || 'Incident'}</strong><br/>
          <span style="font-size: 0.75rem; color: #64748b;">${c.location_text || 'Lagos'}</span><br/>
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
}

// Fetch Cases API with Fallback to Fixture
async function fetchCases() {
  try {
    const res = await fetch('/api/cases');
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();

    if (Array.isArray(data.cases) && data.cases.length > 0) {
      casesData = data.cases;
    } else {
      console.warn('[Relay UI] /api/cases returned empty. Loading fallback fixtures.');
      await loadFallbackFixtures();
    }
  } catch (err) {
    console.warn('[Relay UI] API fetch failed:', err.message, '- Loading fallback fixtures.');
    await loadFallbackFixtures();
  }

  renderUI();
}

// Load Fallback Fixture Data
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
    const textStr = `${c.id} ${c.type} ${c.location_text} ${c.status} ${c.responsible_actor} ${c.evidence ? c.evidence.join(' ') : ''}`.toLowerCase();
    return textStr.includes(searchQuery);
  });

  // Update Case Count Badge
  document.getElementById('case-count-badge').textContent = `${filteredCases.length} Case${filteredCases.length !== 1 ? 's' : ''}`;

  // If no selected case, default to first case
  if (!selectedCaseId && filteredCases.length > 0) {
    selectedCaseId = filteredCases[0].id;
  }

  renderFeedList(filteredCases);
  updateMapMarkers(casesData);
  renderTrustReceipt();
}

// Render Feed List Cards
function renderFeedList(cases) {
  const feedContainer = document.getElementById('case-feed-list');

  if (cases.length === 0) {
    feedContainer.innerHTML = '<div class="loading-state">No matching cases found.</div>';
    return;
  }

  feedContainer.innerHTML = cases.map(c => {
    const isSelected = c.id === selectedCaseId;
    const badgeClass = getBadgeColorClass(c.status);
    const severityClass = c.severity ? `severity-${c.severity.toLowerCase()}` : '';

    return `
      <div class="case-item ${isSelected ? 'selected' : ''}" onclick="selectCase('${c.id}')">
        <div class="case-item-header">
          <span class="case-id">${c.id}</span>
          <span class="badge ${badgeClass}">${c.status}</span>
        </div>
        <div class="case-item-body">
          <strong>${c.type || 'Incident'}</strong>: ${c.location_text || 'Location unverified'}
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

  // Focus map on selected case if lat/lng exists
  const selectedCase = casesData.find(c => c.id === id);
  if (selectedCase && selectedCase.lat && selectedCase.lng && map) {
    map.flyTo([selectedCase.lat, selectedCase.lng], 13, { duration: 0.8 });
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

  const isClosed = (caseRecord.status === 'Claimed Resolved' || caseRecord.status === 'Independently Verified');
  const badgeClass = getBadgeColorClass(caseRecord.status);
  const evidenceCount = Array.isArray(caseRecord.evidence) ? caseRecord.evidence.length : 0;
  const hasVoice = caseRecord.transcript || (Array.isArray(caseRecord.evidence) && caseRecord.evidence.some(e => typeof e === 'object' && e.type === 'voice'));
  const hasGeo = Boolean(caseRecord.lat && caseRecord.lng);

  // Latest Action Note from history
  const latestHistory = Array.isArray(caseRecord.history) && caseRecord.history.length > 0
    ? caseRecord.history[caseRecord.history.length - 1]
    : null;
  const actionText = latestHistory ? latestHistory.note : 'Report received and queued';

  // Resolution Status
  let resolutionText = 'Pending verification';
  if (caseRecord.independent_verification) {
    resolutionText = `Independently Verified: ${caseRecord.independent_verification}`;
  } else if (caseRecord.status === 'Claimed Resolved') {
    resolutionText = 'Claimed Resolved by responder (Pending independent verification)';
  } else if (caseRecord.status === 'Accepted' || caseRecord.status === 'In Progress') {
    resolutionText = 'Active responder engagement';
  }

  // History timeline items
  const historyItems = Array.isArray(caseRecord.history) ? caseRecord.history : [];

  container.innerHTML = `
    <div class="receipt-card">
      <div class="receipt-header">
        <div>
          <div class="field-label">Trust Receipt</div>
          <div class="receipt-id">${caseRecord.id}</div>
        </div>
        <button onclick="window.print()" class="btn btn-secondary btn-sm btn-print" title="Print Trust Receipt">
          <i class="fa-solid fa-print"></i> Print
        </button>
      </div>

      <div class="receipt-field-grid">
        <div class="receipt-field">
          <span class="field-label">Status</span>
          <span class="field-value">
            <span class="badge ${badgeClass}">${caseRecord.status}</span>
          </span>
        </div>

        <div class="receipt-field">
          <span class="field-label">Closed</span>
          <span class="field-value">
            <strong style="color: ${isClosed ? 'var(--status-green)' : 'var(--text-muted)'}">${isClosed ? 'Yes' : 'No'}</strong>
          </span>
        </div>

        <div class="receipt-field full-width">
          <span class="field-label">Evidence</span>
          <span class="field-value">
            ${evidenceCount} independent report(s)
            <span style="font-size: 0.75rem; color: var(--text-muted);">
              (${hasGeo ? 'Geolocation tagged' : 'No GPS'}, ${hasVoice ? 'Voice media attached' : 'Text signal'})
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
          <span class="field-label">SLA Commitment</span>
          <span class="field-value">${caseRecord.sla || 'N/A'}</span>
        </div>

        <div class="receipt-field">
          <span class="field-label">Acknowledged</span>
          <span class="field-value">${timeElapsed(caseRecord.acknowledged_at)}</span>
        </div>

        <div class="receipt-field">
          <span class="field-label">Confidence Score</span>
          <span class="field-value">${caseRecord.confidence_score ?? 0}%</span>
        </div>

        <div class="receipt-field full-width">
          <span class="field-label">Action</span>
          <span class="field-value">${actionText}</span>
        </div>

        <div class="receipt-field full-width">
          <span class="field-label">Resolution</span>
          <span class="field-value" style="color: ${caseRecord.independent_verification ? 'var(--status-green)' : 'inherit'};">
            ${resolutionText}
          </span>
        </div>
      </div>

      <!-- History Timeline -->
      <div class="timeline-container">
        <span class="field-label">Verification & Lifecycle Timeline</span>
        <ul class="timeline" style="margin-top: 8px;">
          ${historyItems.map(item => `
            <li class="timeline-item">
              <div>
                <strong class="badge ${getBadgeColorClass(item.status)}">${item.status}</strong>
                <span class="timeline-time">${new Date(item.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div class="timeline-note">${item.note}</div>
            </li>
          `).join('')}
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
          locationBtn.innerHTML = '<i class="fa-solid fa-check"></i> Location Set';
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

      const data = await res.json();

      if (res.ok && data.case) {
        feedbackEl.className = 'form-feedback success';
        feedbackEl.textContent = `Report processed! Case ${data.case.id} (${data.case.status}).`;
        form.reset();
        locationBtn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Get GPS';

        // Select the returned case immediately
        selectedCaseId = data.case.id;
        await fetchCases();
      } else if (res.ok && data.case === null) {
        feedbackEl.className = 'form-feedback success';
        feedbackEl.textContent = data.note || 'Report processed as non-incident query.';
      } else {
        throw new Error(data.error || 'Failed to submit report');
      }
    } catch (err) {
      console.error('[Submit Error]', err);
      feedbackEl.className = 'form-feedback error';
      feedbackEl.textContent = `Error: ${err.message}`;
    }
  });
}

// App Initialization
window.addEventListener('DOMContentLoaded', () => {
  initMap();
  setupFormHandlers();
  fetchCases();

  // Poll /api/cases every 5 seconds
  setInterval(fetchCases, 5000);
});
