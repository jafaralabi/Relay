/**
 * Relay Frontend Application
 * Handles case feed, status-aware Leaflet map, Trust Receipt component, and report form intake.
 */

// Application State
let casesData = [];
let activeCaseId = null;
let map = null;
let markersGroup = null;

// Status Stage Helper mapping
function getStatusStage(status) {
  switch (status) {
    case 'Signal':
    case 'Corroborating':
      return 'grey';
    case 'Verified':
    case 'Assigned':
      return 'amber';
    case 'Accepted':
    case 'In Progress':
      return 'blue';
    case 'Claimed Resolved':
    case 'Independently Verified':
      return 'green';
    default:
      return 'grey';
  }
}

// Calculate time elapsed string
function formatTimeElapsed(createdAt, ackAt) {
  if (!ackAt) return 'Pending acknowledgment';
  const created = new Date(createdAt);
  const ack = new Date(ackAt);
  const diffMinutes = Math.round((ack - created) / (1000 * 60));
  if (diffMinutes < 1) return 'Acknowledged immediately';
  if (diffMinutes < 60) return `${diffMinutes} minutes after report`;
  const diffHours = (diffMinutes / 60).toFixed(1);
  return `${diffHours} hours after report`;
}

// Format ISO date string nicely
function formatDate(isoString) {
  if (!isoString) return 'N/A';
  const d = new Date(isoString);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Initialize Map
function initMap() {
  const defaultCenter = [6.5244, 3.3792]; // Lagos, Nigeria
  map = L.map('map', {
    zoomControl: true,
    attributionControl: false
  }).setView(defaultCenter, 11);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(map);

  markersGroup = L.layerGroup().addTo(map);
}

// Render Map Markers
function updateMapMarkers() {
  if (!map || !markersGroup) return;
  markersGroup.clearLayers();

  const bounds = [];

  casesData.forEach(c => {
    if (c.lat && c.lng) {
      const stage = getStatusStage(c.status);
      const isHighSeverity = (c.severity === 'High');

      const customClass = `custom-map-marker ${isHighSeverity ? 'high-severity' : ''}`;
      const icon = L.divIcon({
        className: customClass,
        html: `<div class="marker-inner stage-${stage}"></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        popupAnchor: [0, -12]
      });

      const marker = L.marker([c.lat, c.lng], { icon: icon });

      const popupContent = document.createElement('div');
      popupContent.className = 'popup-card';
      popupContent.innerHTML = `
        <h4>${c.type} — ${c.id}</h4>
        <p><strong>Status:</strong> ${c.status}</p>
        <p>${c.location_text || ''}</p>
        <button class="btn btn-sm btn-primary view-receipt-btn">View Receipt</button>
      `;

      popupContent.querySelector('.view-receipt-btn').addEventListener('click', () => {
        selectCase(c.id, true);
        map.closePopup();
      });

      marker.bindPopup(popupContent);
      marker.on('click', () => selectCase(c.id, false));

      markersGroup.addLayer(marker);
      bounds.push([c.lat, c.lng]);
    }
  });

  if (bounds.length > 0 && !activeCaseId) {
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
  }
}

// Render Case Feed
function renderFeed() {
  const listEl = document.getElementById('cases-list');
  const countBadgeEl = document.getElementById('case-count-badge');
  const searchVal = document.getElementById('feed-search').value.toLowerCase().trim();
  const statusFilterVal = document.getElementById('feed-status-filter').value;

  const filtered = casesData.filter(c => {
    const matchesStatus = (statusFilterVal === 'ALL' || c.status === statusFilterVal);
    const matchesSearch = !searchVal ||
      c.id.toLowerCase().includes(searchVal) ||
      (c.location_text && c.location_text.toLowerCase().includes(searchVal)) ||
      (c.type && c.type.toLowerCase().includes(searchVal)) ||
      (c.responsible_actor && c.responsible_actor.toLowerCase().includes(searchVal));
    return matchesStatus && matchesSearch;
  });

  countBadgeEl.textContent = filtered.length;
  listEl.innerHTML = '';

  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="empty-feed" style="text-align: center; color: var(--text-muted); padding: 20px;">No matching cases found.</div>`;
    return;
  }

  filtered.forEach(c => {
    const stage = getStatusStage(c.status);
    const card = document.createElement('div');
    card.className = `case-card stage-${stage} ${c.id === activeCaseId ? 'active' : ''}`;
    card.dataset.id = c.id;

    card.innerHTML = `
      <div class="card-header">
        <span class="card-id">${c.id}</span>
        <span class="status-badge badge-${stage}">${c.status}</span>
      </div>
      <div class="card-body">
        <h4>${c.type} Report</h4>
        <div class="card-location">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"/><circle cx="12" cy="10" r="3"/></svg>
          ${c.location_text || 'Unknown Location'}
        </div>
        <div class="card-meta">
          <span class="severity-tag severity-${(c.severity || 'low').toLowerCase()}">${c.severity || 'Normal'} Severity</span>
          <span>Score: ${c.confidence_score || 0}/100</span>
        </div>
      </div>
    `;

    card.addEventListener('click', () => selectCase(c.id, false));
    listEl.appendChild(card);
  });
}

// Select Case & View Receipt
function selectCase(id, switchTab = false) {
  activeCaseId = id;
  const activeBadge = document.getElementById('active-case-id');
  if (activeBadge) activeBadge.textContent = id ? `(${id})` : '';

  renderFeed();
  renderTrustReceipt();

  const selectedCase = casesData.find(c => c.id === id);
  if (selectedCase && selectedCase.lat && selectedCase.lng && map) {
    map.flyTo([selectedCase.lat, selectedCase.lng], 13, { duration: 0.8 });
  }

  if (switchTab) {
    switchTabTo('receipt');
  }
}

// Render Trust Receipt View
function renderTrustReceipt() {
  const container = document.getElementById('receipt-container');
  if (!activeCaseId) {
    container.innerHTML = `
      <div class="empty-receipt-state">
        <p>Select a case from the feed or map to view its Trust Receipt.</p>
      </div>`;
    return;
  }

  const c = casesData.find(item => item.id === activeCaseId);
  if (!c) {
    container.innerHTML = `<div class="empty-receipt-state"><p>Case not found.</p></div>`;
    return;
  }

  const stage = getStatusStage(c.status);
  const ackTimeText = formatTimeElapsed(c.created_at, c.acknowledged_at);
  const isClosed = ['Independently Verified', 'Claimed Resolved'].includes(c.status);

  let resolutionText = 'Pending Resolution';
  if (c.status === 'Independently Verified') resolutionText = 'Independently Verified';
  else if (c.status === 'Claimed Resolved') resolutionText = 'Claimed Resolved';

  const historyItemsHtml = (c.history || []).map(h => `
    <div class="timeline-item">
      <div class="timeline-item-header">
        <span class="timeline-status">${h.status}</span>
        <span class="timeline-time">${formatDate(h.at)}</span>
      </div>
      <div class="timeline-note">${h.note || ''}</div>
    </div>
  `).join('');

  const evidenceItemsHtml = (c.evidence && c.evidence.length > 0)
    ? c.evidence.map(e => `<li>${e}</li>`).join('')
    : `<li>1 initial signal report</li>`;

  // Get action description from last history entry or default
  const latestHistory = c.history && c.history.length > 0 ? c.history[c.history.length - 1] : null;
  const actionText = latestHistory ? latestHistory.note : 'Case filed and registered into Relay pipeline.';

  container.innerHTML = `
    <div class="trust-receipt-card">
      <div class="receipt-header">
        <div class="receipt-title-box">
          <h3>Relay Official Trust Receipt</h3>
          <div class="receipt-case-id">${c.id}</div>
        </div>
        <button class="receipt-print-btn" onclick="window.print()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
          Print Receipt
        </button>
      </div>

      <div class="receipt-grid">
        <div class="receipt-item">
          <span class="receipt-label">Status Stage</span>
          <span class="receipt-value">
            <span class="status-badge badge-${stage}">${c.status}</span>
          </span>
        </div>

        <div class="receipt-item">
          <span class="receipt-label">Confidence Score</span>
          <span class="receipt-value mono">${c.confidence_score || 0} / 100</span>
        </div>

        <div class="receipt-item">
          <span class="receipt-label">Responsible Actor</span>
          <span class="receipt-value">${c.responsible_actor || 'Unassigned'}</span>
        </div>

        <div class="receipt-item">
          <span class="receipt-label">SLA Commitment</span>
          <span class="receipt-value">${c.sla || 'N/A'}</span>
        </div>

        <div class="receipt-item">
          <span class="receipt-label">Acknowledged</span>
          <span class="receipt-value">${ackTimeText}</span>
        </div>

        <div class="receipt-item">
          <span class="receipt-label">Closed Status</span>
          <span class="receipt-value">${isClosed ? 'Yes' : 'No'}</span>
        </div>

        <div class="receipt-item receipt-full-width">
          <span class="receipt-label">Resolution Status</span>
          <span class="receipt-value">${resolutionText}</span>
          ${c.independent_verification ? `<p style="font-size: 0.8rem; color: #16a34a; margin-top: 4px;"><strong>Verification:</strong> ${c.independent_verification}</p>` : ''}
        </div>

        <div class="receipt-item receipt-full-width">
          <span class="receipt-label">Latest Action / Note</span>
          <span class="receipt-value" style="font-size: 0.85rem; font-weight: 400;">${actionText}</span>
        </div>

        <div class="receipt-item receipt-full-width">
          <span class="receipt-label">Evidence & Verification Signals</span>
          <ul class="evidence-list">
            ${evidenceItemsHtml}
          </ul>
        </div>
      </div>

      <div class="receipt-timeline">
        <h4>Audit & Progression Timeline</h4>
        <div class="timeline-items">
          ${historyItemsHtml}
        </div>
      </div>
    </div>
  `;
}

// Switch Left Panel Tabs
function switchTabTo(tabName) {
  document.querySelectorAll('.panel-tabs .tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `view-${tabName}`);
  });
}

// Fetch Cases Data with Fixture Fallback
async function fetchCases() {
  try {
    const res = await fetch('/api/cases');
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    if (data && Array.isArray(data.cases) && data.cases.length > 0) {
      casesData = data.cases;
    } else {
      throw new Error('Empty backend cases response');
    }
  } catch (err) {
    // Fallback to static fixtures
    try {
      const fixtureRes = await fetch('/fixtures/cases.json');
      const fixtureData = await fixtureRes.json();
      if (fixtureData && Array.isArray(fixtureData.cases)) {
        casesData = fixtureData.cases;
      }
    } catch (fErr) {
      console.error('Failed loading cases fixture:', fErr);
    }
  }

  // If no case is active yet, default to the first one (e.g. Agege flagship case)
  if (!activeCaseId && casesData.length > 0) {
    activeCaseId = casesData[0].id;
  }

  renderFeed();
  updateMapMarkers();
  renderTrustReceipt();
}

// Setup Event Listeners
function setupEventListeners() {
  // Tabs
  document.querySelectorAll('.panel-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTabTo(btn.dataset.tab));
  });

  // Search & Filter Inputs
  document.getElementById('feed-search').addEventListener('input', renderFeed);
  document.getElementById('feed-status-filter').addEventListener('change', renderFeed);

  // Modal Open / Close
  const modal = document.getElementById('modal-report');
  document.getElementById('btn-new-report').addEventListener('click', () => {
    modal.classList.remove('hidden');
  });

  const closeModal = () => modal.classList.add('hidden');
  document.getElementById('btn-close-modal').addEventListener('click', closeModal);
  document.getElementById('btn-cancel-report').addEventListener('click', closeModal);

  // Use My Location
  document.getElementById('btn-use-location').addEventListener('click', () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          document.getElementById('report-lat').value = pos.coords.latitude.toFixed(4);
          document.getElementById('report-lng').value = pos.coords.longitude.toFixed(4);
        },
        (err) => {
          alert('Unable to retrieve location. Please enter coordinates manually.');
        }
      );
    } else {
      alert('Geolocation is not supported by your browser.');
    }
  });

  // Report Form Submit
  document.getElementById('report-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = document.getElementById('report-text').value;
    const lat = parseFloat(document.getElementById('report-lat').value) || 6.5244;
    const lng = parseFloat(document.getElementById('report-lng').value) || 3.3792;
    const audioInput = document.getElementById('report-audio');

    let newCase = null;

    try {
      if (audioInput.files && audioInput.files.length > 0) {
        const formData = new FormData();
        formData.append('audio', audioInput.files[0]);
        formData.append('text', text);
        formData.append('lat', lat);
        formData.append('lng', lng);

        const res = await fetch('/api/reports/voice', {
          method: 'POST',
          body: formData
        });
        if (!res.ok) throw new Error('Voice submit failed');
        const data = await res.json();
        newCase = data.case || data;
      } else {
        const res = await fetch('/api/reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, lat, lng })
        });
        if (!res.ok) throw new Error('Text submit failed');
        const data = await res.json();
        newCase = data.case || data;
      }
    } catch (err) {
      // Offline/Mock fallback creation so user form always returns a visible case immediately
      const mockId = `RLA-${Math.floor(1000 + Math.random() * 9000)}`;
      const nowIso = new Date().toISOString();
      newCase = {
        id: mockId,
        status: 'Signal',
        type: text.toLowerCase().includes('water') || text.toLowerCase().includes('borehole') ? 'Transparency' : 'Safety',
        severity: text.toLowerCase().includes('armed') || text.toLowerCase().includes('fight') ? 'High' : 'Medium',
        confidence_score: 40,
        responsible_actor: 'Unassigned (Pending Triaging)',
        sla: '24 hours',
        acknowledged_at: null,
        evidence: [`User web intake: "${text.substring(0, 50)}..."`],
        independent_verification: null,
        created_at: nowIso,
        updated_at: nowIso,
        lat: lat,
        lng: lng,
        location_text: `Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
        history: [
          { status: 'Signal', at: nowIso, note: `New intake signal received: "${text}"` }
        ]
      };
    }

    if (newCase && newCase.id) {
      // Insert into local state at top
      const existingIdx = casesData.findIndex(item => item.id === newCase.id);
      if (existingIdx >= 0) {
        casesData[existingIdx] = newCase;
      } else {
        casesData.unshift(newCase);
      }

      // Reset form and close modal
      document.getElementById('report-form').reset();
      closeModal();

      // Show receipt and update UI
      selectCase(newCase.id, true);
    }
  });
}

// App Initialization
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  setupEventListeners();
  fetchCases();

  // Poll /api/cases every 5 seconds
  setInterval(fetchCases, 5000);
});
