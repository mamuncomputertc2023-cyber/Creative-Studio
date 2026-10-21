// LicenseKey PRO - Multi-Tenant Developer Licensing Cloud
// Theme: White, Emerald Green & Crimson Red (Bangladesh Flag Vibe)
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

let currentUser = null;
let authToken = localStorage.getItem('dev_token') || null;
let cachedProducts = [];
let cachedLicenses = [];
let lastBatchKeys = [];

async function initApp() {
  initEventListeners();
  loadPublicStats();
  updateSdkServerUrls();

  // Check if developer already logged in
  if (authToken) {
    await verifySession();
  } else {
    showLandingView();
  }
}

// ==========================================
// 1. Session & Auth State Management
// ==========================================
async function verifySession() {
  try {
    const res = await fetch('/api/v1/auth/me', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    if (data.success && data.user) {
      currentUser = data.user;
      showWorkspaceView();
    } else {
      logoutLocal();
    }
  } catch (err) {
    logoutLocal();
  }
}

function showLandingView() {
  document.getElementById('viewPublicLanding').style.display = 'block';
  document.getElementById('viewWorkspace').style.display = 'none';
  loadPublicStats();
}

function showWorkspaceView() {
  document.getElementById('viewPublicLanding').style.display = 'none';
  document.getElementById('viewWorkspace').style.display = 'flex';

  // Update developer metadata
  if (currentUser) {
    document.getElementById('sideDevStudio').textContent = currentUser.studioName || currentUser.name;
    document.getElementById('topbarDevName').textContent = currentUser.studioName || currentUser.name;
    document.getElementById('sideApiKey').textContent = currentUser.apiKey || 'pk_live_...';
  }

  loadDeveloperData();
}

function logoutLocal() {
  currentUser = null;
  authToken = null;
  localStorage.removeItem('dev_token');
  showLandingView();
}

// ==========================================
// 2. Global Event Listeners & Mobile Nav
// ==========================================
function initEventListeners() {
  // Mobile Navigation Toggles
  document.getElementById('btnPublicNavToggle')?.addEventListener('click', () => {
    document.getElementById('publicNavLinks')?.classList.toggle('mobile-show');
  });

  document.getElementById('btnMobileSidebarToggle')?.addEventListener('click', () => {
    toggleMobileSidebar(true);
  });

  // Auth Forms
  document.getElementById('formLogin')?.addEventListener('submit', handleLoginSubmit);
  document.getElementById('formRegister')?.addEventListener('submit', handleRegisterSubmit);
  document.getElementById('btnLogout')?.addEventListener('click', handleLogout);

  // Public License Verification
  document.getElementById('formPublicLookup')?.addEventListener('submit', handlePublicLicenseLookup);

  // Developer Workspace Tab Switcher
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      switchTab(tab);
      toggleMobileSidebar(false); // Close sidebar on mobile upon tab selection
    });
  });

  // Developer Forms
  document.getElementById('formAddProduct')?.addEventListener('submit', handleAddProductSubmit);
  document.getElementById('formGenLicense')?.addEventListener('submit', handleGenLicenseSubmit);
  document.getElementById('formBatchGen')?.addEventListener('submit', handleBatchGenSubmit);
  document.getElementById('formPublishRelease')?.addEventListener('submit', handlePublishReleaseSubmit);
  document.getElementById('formCreateNotice')?.addEventListener('submit', handleCreateNoticeSubmit);
  document.getElementById('formSimulateWebhook')?.addEventListener('submit', handleSimulateWebhookSubmit);

  // License Tier Custom Days Listeners
  document.getElementById('genType')?.addEventListener('change', (e) => {
    const val = e.target.value;
    const durInput = document.getElementById('genDuration');
    const hint = document.getElementById('genDurationHint');
    if (!durInput) return;
    if (val === 'lifetime') {
      durInput.value = '';
      durInput.disabled = true;
      if (hint) hint.textContent = 'Lifetime licenses never expire';
    } else if (val === 'yearly') {
      durInput.disabled = false;
      durInput.value = 365;
      if (hint) hint.textContent = 'Standard 365-day annual license';
    } else if (val === 'monthly') {
      durInput.disabled = false;
      durInput.value = 30;
      if (hint) hint.textContent = 'Standard 30-day monthly license';
    } else if (val === 'trial') {
      durInput.disabled = false;
      durInput.value = 14;
      if (hint) hint.textContent = '14-day free evaluation trial';
    } else if (val === 'custom') {
      durInput.disabled = false;
      if (!durInput.value || durInput.value <= 0) durInput.value = 30;
      durInput.focus();
      if (hint) hint.textContent = 'Enter custom number of days (e.g. 7, 45, 90, 180)';
    }
  });

  document.getElementById('batchType')?.addEventListener('change', (e) => {
    const val = e.target.value;
    const group = document.getElementById('batchDurationGroup');
    const input = document.getElementById('batchDuration');
    if (!group) return;
    if (val === 'custom') {
      group.style.display = 'block';
      input?.focus();
    } else if (val === 'trial') {
      group.style.display = 'block';
      if (input) input.value = 14;
    } else if (val === 'monthly') {
      group.style.display = 'block';
      if (input) input.value = 30;
    } else if (val === 'yearly') {
      group.style.display = 'block';
      if (input) input.value = 365;
    } else {
      group.style.display = 'none';
    }
  });

  // Table Filters
  document.getElementById('devSearchInput')?.addEventListener('input', applyLicenseFilters);
  document.getElementById('filterProduct')?.addEventListener('change', applyLicenseFilters);
  document.getElementById('filterStatus')?.addEventListener('change', applyLicenseFilters);

  // Simulator
  document.getElementById('btnSimulateActivate')?.addEventListener('click', handleSimulateActivate);
  document.getElementById('btnSimulateCheckUpdate')?.addEventListener('click', handleSimulateCheckUpdate);

  // Export Workspace Backup
  document.getElementById('btnWorkspaceExport')?.addEventListener('click', () => {
    if (authToken) {
      window.location.href = `/api/v1/backup?token=${authToken}`;
    }
  });

  // Copy Generated Key
  document.getElementById('btnCopyGenKey')?.addEventListener('click', () => {
    const key = document.getElementById('dispGenKey')?.textContent;
    if (key) copyText(key);
  });

  // Download Batch CSV
  document.getElementById('btnDownloadBatchCsv')?.addEventListener('click', downloadBatchCsv);

  // Refresh Stats
  document.getElementById('btnRefreshDevStats')?.addEventListener('click', () => {
    loadDeveloperData();
    showToast('Analytics refreshed', 'success');
  });
}

window.toggleMobileSidebar = function(open) {
  const sidebar = document.querySelector('.sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (!sidebar || !backdrop) return;

  if (open) {
    sidebar.classList.add('mobile-open');
    backdrop.classList.add('active');
  } else {
    sidebar.classList.remove('mobile-open');
    backdrop.classList.remove('active');
  }
};

window.scrollToSection = function(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth' });
};

// ==========================================
// 3. Auth Modal (Sign In / Register)
// ==========================================
window.openAuthModal = function(tab = 'login') {
  document.getElementById('authModal').style.display = 'flex';
  switchAuthTab(tab);
};

window.closeAuthModal = function() {
  document.getElementById('authModal').style.display = 'none';
};

window.switchAuthTab = function(tab) {
  const tabLogin = document.getElementById('tabAuthLogin');
  const tabReg = document.getElementById('tabAuthRegister');
  const formLogin = document.getElementById('formLogin');
  const formReg = document.getElementById('formRegister');

  if (tab === 'login') {
    tabLogin.classList.add('active');
    tabReg.classList.remove('active');
    formLogin.style.display = 'block';
    formReg.style.display = 'none';
  } else {
    tabReg.classList.add('active');
    tabLogin.classList.remove('active');
    formLogin.style.display = 'none';
    formReg.style.display = 'block';
  }
};

async function handleRegisterSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('regName').value.trim();
  const studioName = document.getElementById('regStudio').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;

  try {
    const res = await fetch('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, studioName, email, password })
    });
    const data = await res.json();

    if (data.success && data.token) {
      authToken = data.token;
      currentUser = data.user;
      localStorage.setItem('dev_token', authToken);
      closeAuthModal();
      showToast('🎉 Welcome to LicenseKey PRO! Account created.', 'success');
      showWorkspaceView();
    } else {
      showToast(data.message || 'Registration failed', 'error');
    }
  } catch (err) {
    showToast('Network error during registration', 'error');
  }
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  try {
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (data.success && data.token) {
      authToken = data.token;
      currentUser = data.user;
      localStorage.setItem('dev_token', authToken);
      closeAuthModal();
      showToast('Welcome back, ' + currentUser.name + '!', 'success');
      showWorkspaceView();
    } else {
      showToast(data.message || 'Invalid credentials', 'error');
    }
  } catch (err) {
    showToast('Network error during login', 'error');
  }
}

window.triggerDemoLogin = async function() {
  try {
    const res = await fetch('/api/v1/auth/demo-login', { method: 'POST' });
    const data = await res.json();
    if (data.success && data.token) {
      authToken = data.token;
      currentUser = data.user;
      localStorage.setItem('dev_token', authToken);
      closeAuthModal();
      showToast('Logged in as Demo Developer!', 'success');
      showWorkspaceView();
    }
  } catch (err) {
    showToast('Failed to enter demo mode', 'error');
  }
};

async function handleLogout() {
  if (!confirm('Are you sure you want to log out of your workspace?')) return;
  try {
    await fetch('/api/v1/auth/logout', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
  } catch (e) {}
  logoutLocal();
  showToast('Logged out successfully.', 'info');
}

// ==========================================
// 4. Public Landing Stats & License Lookup
// ==========================================
async function loadPublicStats() {
  try {
    const res = await fetch('/api/v1/public/stats');
    const data = await res.json();
    if (data.success) {
      document.getElementById('pubStatDevelopers').textContent = data.totalDevelopers || 1;
      document.getElementById('pubStatProducts').textContent = data.totalProducts || 3;
      document.getElementById('pubStatLicenses').textContent = data.totalLicenses || 5;
      document.getElementById('pubStatActivations').textContent = data.totalActivations || 2;
    }
  } catch (err) {
    console.error('Error fetching public stats:', err);
  }
}

async function handlePublicLicenseLookup(e) {
  e.preventDefault();
  const query = document.getElementById('publicLookupInput').value.trim();
  const box = document.getElementById('publicLookupResults');
  const card = document.getElementById('publicLookupCard');

  try {
    const res = await fetch('/api/v1/portal/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    const data = await res.json();

    if (!data.success || !data.licenses || data.licenses.length === 0) {
      showToast(data.message || 'No license found matching that key or email', 'error');
      box.style.display = 'none';
      return;
    }

    const lic = data.licenses[0];
    const isRevoked = lic.status === 'revoked';
    const isExpired = lic.status === 'expired';
    let statusBadge = '<span class="badge badge-active">Active</span>';
    if (isRevoked) statusBadge = '<span class="badge badge-revoked">Revoked / Suspended</span>';
    if (isExpired) statusBadge = '<span class="badge badge-expired">Expired</span>';

    const activations = lic.activations || [];
    let devicesHtml = activations.length === 0 
      ? '<span style="color: var(--text-dim); font-size: 0.85rem;">No active computers currently bound.</span>'
      : activations.map(a => `
        <div style="display:flex; justify-content:space-between; align-items:center; background:#ffffff; border:1px solid var(--border); padding:0.6rem 0.85rem; border-radius:6px; margin-top:6px;">
          <div><strong>💻 ${escapeHtml(a.deviceName)}</strong> <span style="color:var(--text-dim); font-size:0.75rem;">(${escapeHtml(a.hwid)})</span></div>
          <button class="btn btn-danger btn-sm" onclick="publicDeactivateDevice('${escapeHtml(lic.key)}', '${escapeHtml(a.hwid)}')">✕ Deactivate Seat</button>
        </div>
      `).join('');

    card.innerHTML = `
      <div style="background:#ffffff; border:1px solid rgba(0, 106, 78, 0.3); border-radius:12px; padding:1.5rem; text-align:left; box-shadow:var(--shadow-card);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1rem; border-bottom:1px solid var(--border); padding-bottom:1rem;">
          <div>
            <h3 style="font-size:1.25rem; font-weight:800; color:var(--text-main);">${escapeHtml(lic.product)} ${statusBadge}</h3>
            <span class="key-mono" style="margin-top:6px;">🔑 ${escapeHtml(lic.key)}</span>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="copyText('${escapeHtml(lic.key)}')">Copy Key</button>
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:1rem; margin-bottom:1.25rem;">
          <div><span style="font-size:0.75rem; color:var(--text-dim); font-weight:700;">LICENSED TO</span><div style="font-weight:700; color:var(--text-main);">${escapeHtml(lic.customerName)}</div></div>
          <div><span style="font-size:0.75rem; color:var(--text-dim); font-weight:700;">TIER</span><div style="font-weight:700; text-transform:capitalize;">${escapeHtml(lic.type)}</div></div>
          <div><span style="font-size:0.75rem; color:var(--text-dim); font-weight:700;">SEATS OCCUPIED</span><div style="font-weight:700; color:var(--bd-green);">${activations.length} / ${lic.maxDevices || 1}</div></div>
        </div>
        <div style="background:#f8fafc; border:1px solid var(--border); border-radius:8px; padding:1rem;">
          <strong style="font-size:0.85rem; display:block; margin-bottom:0.5rem;">Registered Computers:</strong>
          ${devicesHtml}
        </div>
      </div>
    `;

    box.style.display = 'block';
    showToast('License verified!', 'success');
  } catch (err) {
    showToast('Error looking up license', 'error');
  }
}

window.publicDeactivateDevice = async function(key, hwid) {
  if (!confirm(`Deactivate computer ${hwid}? This will free up 1 seat so you can activate on another PC.`)) return;
  try {
    const res = await fetch('/api/v1/portal/deactivate-device', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, hwid })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      document.getElementById('formPublicLookup').dispatchEvent(new Event('submit'));
    } else {
      showToast(data.message || 'Deactivation failed', 'error');
    }
  } catch (err) {
    showToast('Network error during deactivation', 'error');
  }
};

// ==========================================
// 5. Developer Workspace Controller
// ==========================================
window.switchTab = function(tabName) {
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(btn => {
    if (btn.getAttribute('data-tab') === tabName) {
      btn.classList.add('active');
      const title = btn.textContent.trim();
      const tabTitleEl = document.getElementById('topbarTabTitle');
      if (tabTitleEl) tabTitleEl.textContent = title;
    } else {
      btn.classList.remove('active');
    }
  });

  document.querySelectorAll('.view-panel').forEach(panel => {
    panel.classList.remove('active');
  });

  const target = document.getElementById(`tab-${tabName}`);
  if (target) target.classList.add('active');

  // Trigger contextual refreshes
  if (tabName === 'dev-analytics') loadDeveloperData();
  if (tabName === 'dev-licenses') fetchLicenses();
  if (tabName === 'dev-products') fetchProducts();
  if (tabName === 'dev-releases') fetchReleases();
  if (tabName === 'dev-notices') fetchNotices();
  if (tabName === 'dev-webhooks') fetchWebhookLogs();
};

async function loadDeveloperData() {
  if (!authToken) return;
  await Promise.all([
    fetchStats(),
    fetchProducts(),
    fetchLicenses(),
    fetchReleases(),
    fetchNotices(),
    fetchWebhookLogs(),
    fetchAnalyticsAndDrawCharts()
  ]);
}

async function fetchStats() {
  try {
    const res = await fetch('/api/v1/stats', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    if (data.success && data.stats) {
      document.getElementById('kpiMyProducts').textContent = data.stats.totalProducts || 0;
      document.getElementById('kpiMyLicenses').textContent = data.stats.totalLicenses || 0;
      document.getElementById('kpiMyDevices').textContent = data.stats.activeDevices || 0;
      document.getElementById('kpiMyReleases').textContent = data.stats.totalReleases || 0;
    }
  } catch (err) {
    console.error('Error fetching dev stats:', err);
  }
}

async function fetchAnalyticsAndDrawCharts() {
  try {
    const res = await fetch('/api/v1/analytics', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    if (data.success && data.analytics) {
      drawTimelineChart(data.analytics.timeline || {});
      drawTiersChart(data.analytics.tierDistribution || {});
      renderGeoDistribution(data.analytics.geoDistribution || {});
    }

    const auditRes = await fetch('/api/v1/audit-logs', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const auditData = await auditRes.json();
    if (auditData.success) {
      renderAuditLogs(auditData.logs || []);
    }
  } catch (err) {
    console.error('Error loading analytics:', err);
  }
}

function renderAuditLogs(logs) {
  const list = document.getElementById('auditLogList');
  if (!list) return;

  if (logs.length === 0) {
    list.innerHTML = `<div style="color: var(--text-dim); font-size: 0.85rem; padding: 1rem 0;">No audit events recorded yet.</div>`;
    return;
  }

  list.innerHTML = logs.slice(0, 15).map(log => {
    const timeFormatted = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const eventName = log.event || 'LOG_ENTRY';
    let badgeClass = 'badge-info';
    if (eventName.includes('ACTIVAT') || eventName.includes('REGISTERED')) badgeClass = 'badge-active';
    if (eventName.includes('REVOKE') || eventName.includes('FAILED')) badgeClass = 'badge-revoked';

    let detailsText = '';
    if (typeof log.details === 'object' && log.details !== null) {
      detailsText = Object.entries(log.details).map(([k, v]) => `${k}: ${v}`).join(' | ');
    } else {
      detailsText = String(log.details || '');
    }

    return `
      <div class="audit-item">
        <div class="audit-left">
          <div class="audit-action">
            <span class="badge ${badgeClass}">${escapeHtml(eventName)}</span>
          </div>
          <div class="audit-meta">${escapeHtml(detailsText)}</div>
        </div>
        <div class="audit-time">${timeFormatted}</div>
      </div>
    `;
  }).join('');
}

// ==========================================
// 6. Bangladesh Vibe Canvas Charts (Light Green & Red)
// ==========================================
function drawTimelineChart(timeline) {
  const canvas = document.getElementById('chartTimeline');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.parentElement.clientWidth - 48;
  const height = 180;

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);

  const keys = Object.keys(timeline);
  const values = Object.values(timeline);
  const maxVal = Math.max(...values, 5);

  ctx.clearRect(0, 0, width, height);

  // Grid lines
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = 20 + (height - 50) * (i / 4);
    ctx.beginPath();
    ctx.moveTo(35, y);
    ctx.lineTo(width - 10, y);
    ctx.stroke();
  }

  // Smooth Green Curve
  const stepX = (width - 55) / Math.max(1, keys.length - 1);
  const points = values.map((val, idx) => ({
    x: 40 + idx * stepX,
    y: height - 30 - (val / maxVal) * (height - 60)
  }));

  // Emerald Green Gradient Fill
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, 'rgba(0, 106, 78, 0.2)');
  grad.addColorStop(1, 'rgba(0, 106, 78, 0.0)');

  ctx.beginPath();
  points.forEach((pt, i) => {
    if (i === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  });
  ctx.lineTo(points[points.length - 1].x, height - 30);
  ctx.lineTo(points[0].x, height - 30);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Emerald Green Stroke
  ctx.beginPath();
  points.forEach((pt, i) => {
    if (i === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  });
  ctx.strokeStyle = '#006a4e';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Red Circular Sun Dots (Bangladesh motif)
  points.forEach((pt, i) => {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#f42a41'; // Bangladesh Crimson Red
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    const shortDate = keys[i].split('-').slice(1).join('/');
    ctx.fillStyle = '#64748b';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(shortDate, pt.x, height - 12);
  });
}

function drawTiersChart(tierDist) {
  const canvas = document.getElementById('chartTiers');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.parentElement.clientWidth - 48;
  const height = 180;

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);

  const tiers = ['lifetime', 'yearly', 'monthly', 'trial'];
  const colors = ['#006a4e', '#059669', '#2563eb', '#f42a41'];
  const counts = tiers.map(t => tierDist[t] || 0);
  const maxCount = Math.max(...counts, 4);

  ctx.clearRect(0, 0, width, height);

  const barWidth = 44;
  const gap = (width - 60 - barWidth * tiers.length) / (tiers.length + 1);

  tiers.forEach((tier, idx) => {
    const count = counts[idx];
    const barHeight = (count / maxCount) * (height - 65);
    const x = 30 + gap + idx * (barWidth + gap);
    const y = height - 30 - barHeight;

    ctx.fillStyle = '#f1f5f9';
    ctx.beginPath();
    ctx.roundRect(x, 20, barWidth, height - 50, 6);
    ctx.fill();

    ctx.fillStyle = colors[idx];
    ctx.beginPath();
    ctx.roundRect(x, y, barWidth, barHeight, 6);
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(count, x + barWidth / 2, y - 6);

    ctx.fillStyle = '#475569';
    ctx.font = '10px sans-serif';
    ctx.fillText(tier.toUpperCase(), x + barWidth / 2, height - 12);
  });
}

// ==========================================
// 7. Developer Products Catalog
// ==========================================
async function fetchProducts() {
  if (!authToken) return;
  try {
    const res = await fetch('/api/v1/products', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    if (data.success) {
      cachedProducts = data.products || [];
      populateProductSelects(cachedProducts);
      renderProductsList(cachedProducts);
    }
  } catch (err) {
    console.error('Error loading products:', err);
  }
}

function populateProductSelects(products) {
  const selects = [
    document.getElementById('genProduct'),
    document.getElementById('batchProduct'),
    document.getElementById('relProduct'),
    document.getElementById('filterProduct'),
    document.getElementById('noticeProductSelect'),
    document.getElementById('simWhProduct')
  ];

  selects.forEach(sel => {
    if (!sel) return;
    const isFilter = sel.id === 'filterProduct';
    const isNotice = sel.id === 'noticeProductSelect';
    const curr = sel.value;
    if (isFilter) {
      sel.innerHTML = '<option value="ALL">All Products</option>';
    } else if (isNotice) {
      sel.innerHTML = '<option value="ALL">🌍 All Plugins &amp; Products</option>';
    } else {
      sel.innerHTML = '';
    }

    products.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.name;
      opt.textContent = (isFilter || isNotice) ? p.name : `${p.name} (${p.category || 'Plugin'})`;
      sel.appendChild(opt);
    });
    if (curr) sel.value = curr;
  });
}

function renderProductsList(products) {
  const container = document.getElementById('devProductsList');
  if (!container) return;

  if (products.length === 0) {
    container.innerHTML = `<div style="color:var(--text-dim); font-size:0.85rem; padding:1.5rem;">No products configured yet. Use the form on the left to add your first software product!</div>`;
    return;
  }

  container.innerHTML = products.map(p => `
    <div class="product-item-card">
      <div class="product-item-top">
        <div>
          <strong style="color:var(--text-main); font-size:1rem;">${escapeHtml(p.name)}</strong>
          <span class="badge badge-info" style="margin-left:6px;">Prefix: ${escapeHtml(p.prefix)}</span>
          <span class="badge badge-pulse" style="margin-left:4px;">v${escapeHtml(p.latestVersion || '1.0.0')}</span>
        </div>
        <button class="btn btn-danger btn-sm" onclick="handleDeleteProduct('${escapeHtml(p.id)}')">Delete</button>
      </div>
      <p style="font-size:0.84rem; color:var(--text-muted); margin-bottom:0.75rem;">${escapeHtml(p.description || 'No description.')}</p>
      <div style="font-size:0.78rem; color:var(--text-dim);">
        Category: <strong>${escapeHtml(p.category)}</strong> • Download: <a href="${escapeHtml(p.downloadUrl || '#')}" target="_blank" style="color:var(--bd-green);">${escapeHtml(p.downloadUrl || 'None')}</a>
      </div>
    </div>
  `).join('');
}

function formatDownloadUrl(url) {
  if (!url) return '';
  url = url.trim();
  
  // 1. Convert Google Drive link to direct download
  const gdriveMatch = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([a-zA-Z0-9_-]+)/);
  if (gdriveMatch && gdriveMatch[1]) {
    return `https://drive.google.com/uc?export=download&id=${gdriveMatch[1]}`;
  }

  // 2. Convert Dropbox link to direct download
  if (url.includes('dropbox.com')) {
    return url.replace('?dl=0', '?dl=1');
  }

  return url;
}

async function handleAddProductSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('prodName').value.trim();
  const prefix = document.getElementById('prodPrefix').value.trim();
  const category = document.getElementById('prodCategory').value;
  const latestVersion = document.getElementById('prodVersion').value.trim();
  const trialDays = parseInt(document.getElementById('prodTrialDays').value, 10) || 14;
  const rawDownloadUrl = document.getElementById('prodDownloadUrl').value.trim();
  const downloadUrl = formatDownloadUrl(rawDownloadUrl);
  const description = document.getElementById('prodDesc').value.trim();

  try {
    const res = await fetch('/api/v1/products', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name, prefix, category, latestVersion, trialDays, downloadUrl, description })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Product added to your catalog!', 'success');
      e.target.reset();
      fetchProducts();
      fetchStats();
    } else {
      showToast(data.message || 'Error saving product', 'error');
    }
  } catch (err) {
    showToast('Network error', 'error');
  }
}

window.handleDeleteProduct = async function(id) {
  if (!confirm('Are you sure you want to delete this product?')) return;
  try {
    const res = await fetch(`/api/v1/products/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    if (data.success) {
      showToast('Product deleted', 'success');
      fetchProducts();
      fetchStats();
    }
  } catch (e) {
    showToast('Network error', 'error');
  }
};

// ==========================================
// 8. Developer License Management
// ==========================================
async function fetchLicenses() {
  if (!authToken) return;
  try {
    const res = await fetch('/api/v1/licenses', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    if (data.success) {
      cachedLicenses = data.licenses || [];
      applyLicenseFilters();
    }
  } catch (err) {
    console.error('Error loading licenses:', err);
  }
}

function applyLicenseFilters() {
  const query = (document.getElementById('devSearchInput')?.value || '').toLowerCase();
  const prodFilter = document.getElementById('filterProduct')?.value || 'ALL';
  const statusFilter = document.getElementById('filterStatus')?.value || 'ALL';

  const filtered = cachedLicenses.filter(lic => {
    const matchQuery = !query || 
      (lic.key && lic.key.toLowerCase().includes(query)) ||
      (lic.customerName && lic.customerName.toLowerCase().includes(query)) ||
      (lic.customerEmail && lic.customerEmail.toLowerCase().includes(query)) ||
      (lic.product && lic.product.toLowerCase().includes(query));

    const matchProd = prodFilter === 'ALL' || lic.product === prodFilter;
    const matchStatus = statusFilter === 'ALL' || lic.status === statusFilter;

    return matchQuery && matchProd && matchStatus;
  });

  renderLicensesTable(filtered);
}

function renderLicensesTable(licenses) {
  const tbody = document.getElementById('devLicensesTableBody');
  if (!tbody) return;

  if (licenses.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-dim); padding: 2.5rem;">No matching licenses found in your account.</td></tr>`;
    return;
  }

  tbody.innerHTML = licenses.map(lic => {
    const createdDate = new Date(lic.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    const deviceCount = (lic.activations || []).length;
    const maxDevices = lic.maxDevices || 1;
    const isRevoked = lic.status === 'revoked';

    return `
      <tr>
        <td><strong>${escapeHtml(lic.product)}</strong></td>
        <td><span class="key-mono" onclick="copyText('${escapeHtml(lic.key)}')">${escapeHtml(lic.key)}</span></td>
        <td class="customer-cell">
          <strong>${escapeHtml(lic.customerName)}</strong>
          <span>${escapeHtml(lic.customerEmail)}</span>
        </td>
        <td>
          ${lic.type === 'custom' 
            ? `<span class="badge" style="background:#dcfce7; color:#15803d; font-weight:700;">Custom (${lic.durationDays || 'N/A'}d)</span>`
            : lic.type === 'trial'
            ? `<span class="badge" style="background:#fee2e2; color:#b91c1c; font-weight:700;">Trial (${lic.durationDays || 14}d)</span>`
            : lic.type === 'monthly'
            ? `<span class="badge" style="background:#f3e8ff; color:#6b21a8; font-weight:700;">Monthly</span>`
            : lic.type === 'yearly'
            ? `<span class="badge" style="background:#fef3c7; color:#92400e; font-weight:700;">1-Year</span>`
            : `<span class="badge" style="background:#e0f2fe; color:#0369a1; font-weight:700;">Lifetime</span>`
          }
        </td>
        <td><span class="badge ${isRevoked ? 'badge-revoked' : 'badge-active'}">${isRevoked ? 'Revoked' : 'Active'}</span></td>
        <td class="device-counter">
          <strong>${deviceCount}</strong> / ${maxDevices} Devices
          ${(lic.activations && lic.activations.length > 0) ? `
            <div style="font-size:0.75rem; color:var(--text-dim); margin-top:3px;">
              ${lic.activations.map(a => `${a.flag || '🌐'} ${escapeHtml(a.city ? a.city + ', ' : '')}${escapeHtml(a.country || '')}`).filter(Boolean).join(' • ')}
            </div>
          ` : ''}
        </td>
        <td style="color: var(--text-dim); font-size: 0.8rem;">${createdDate}</td>
        <td>
          <div class="table-actions">
            <button class="btn btn-secondary btn-sm" title="Copy Key" onclick="copyText('${escapeHtml(lic.key)}')">📋</button>
            <button class="btn btn-secondary btn-sm" title="Reset HWID / Unbind All Devices" onclick="handleResetHwid('${escapeHtml(lic.key)}')">🔄 Reset</button>
            <button class="btn ${isRevoked ? 'btn-secondary' : 'btn-danger'} btn-sm" onclick="handleToggleRevoke('${escapeHtml(lic.key)}')">
              ${isRevoked ? 'Restore' : 'Revoke'}
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

window.handleToggleRevoke = async function(key) {
  try {
    const res = await fetch('/api/v1/licenses/revoke', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ key })
    });
    const data = await res.json();
    if (data.success) {
      showToast('License status updated!', 'success');
      fetchLicenses();
      fetchStats();
    }
  } catch (e) {
    showToast('Network error', 'error');
  }
};

window.handleResetHwid = async function(key) {
  if (!confirm(`Unbind all devices for key ${key}? This frees up all seats.`)) return;
  try {
    const res = await fetch('/api/v1/licenses/reset-hwid', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ key })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Devices successfully unbound!', 'success');
      fetchLicenses();
      fetchStats();
    }
  } catch (e) {
    showToast('Network error', 'error');
  }
};

// ==========================================
// 9. Key Generation (Single & Batch CSV)
// ==========================================
async function handleGenLicenseSubmit(e) {
  e.preventDefault();
  const product = document.getElementById('genProduct').value;
  const prefix = document.getElementById('genPrefix').value.trim() || 'KEY';
  const customerName = document.getElementById('genCustName').value.trim();
  const customerEmail = document.getElementById('genCustEmail').value.trim();
  const type = document.getElementById('genType').value;
  const maxDevices = parseInt(document.getElementById('genMaxDevices').value, 10) || 1;
  const durationDays = parseInt(document.getElementById('genDuration').value, 10) || 30;

  try {
    const res = await fetch('/api/v1/licenses/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ product, prefix, customerName, customerEmail, type, maxDevices, durationDays })
    });
    const data = await res.json();

    if (data.success && data.license) {
      const box = document.getElementById('genResultBox');
      const dispKey = document.getElementById('dispGenKey');
      const dispMeta = document.getElementById('dispGenMeta');

      dispKey.textContent = data.license.key;
      dispMeta.textContent = `Product: ${data.license.product} | Seats: ${data.license.maxDevices} | Tier: ${data.license.type} | Client: ${data.license.customerName}`;
      box.style.display = 'block';

      showToast('New License Key Issued!', 'success');
      fetchLicenses();
      fetchStats();
      e.target.reset();
    } else {
      showToast(data.message || 'Key generation failed', 'error');
    }
  } catch (err) {
    showToast('Network error', 'error');
  }
}

async function handleBatchGenSubmit(e) {
  e.preventDefault();
  const count = parseInt(document.getElementById('batchCount').value, 10) || 10;
  const product = document.getElementById('batchProduct').value;
  const prefix = document.getElementById('batchPrefix').value.trim() || 'KEY';
  const type = document.getElementById('batchType').value;
  const durationDays = parseInt(document.getElementById('batchDuration')?.value, 10) || (type === 'trial' ? 14 : (type === 'yearly' ? 365 : 30));
  const maxDevices = parseInt(document.getElementById('batchSeats').value, 10) || 2;
  const batchTag = document.getElementById('batchTag').value.trim() || 'Campaign-Batch';

  try {
    const res = await fetch('/api/v1/licenses/batch-generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ count, product, prefix, type, durationDays, maxDevices, batchTag })
    });
    const data = await res.json();

    if (data.success && data.keys) {
      lastBatchKeys = data.keys;
      const list = document.getElementById('batchResultsList');
      const btnCsv = document.getElementById('btnDownloadBatchCsv');

      btnCsv.style.display = 'inline-flex';
      list.innerHTML = data.keys.map(k => `
        <div class="batch-key-item">
          <div>
            <strong class="key-mono" onclick="copyText('${escapeHtml(k.key)}')">${escapeHtml(k.key)}</strong>
            <span style="font-size:0.75rem; color:var(--text-dim); margin-left:8px;">${escapeHtml(k.customerName)}</span>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="copyText('${escapeHtml(k.key)}')">Copy</button>
        </div>
      `).join('');

      showToast(`Successfully generated batch of ${data.count} keys!`, 'success');
      fetchLicenses();
      fetchStats();
    } else {
      showToast(data.message || 'Batch generation failed', 'error');
    }
  } catch (err) {
    showToast('Network error', 'error');
  }
}

function downloadBatchCsv() {
  if (!lastBatchKeys || lastBatchKeys.length === 0) return;

  const header = ['LicenseKey', 'Product', 'Tier', 'Seats', 'BatchTag', 'CreatedDate'];
  const rows = lastBatchKeys.map(k => [
    k.key,
    `"${k.product}"`,
    k.type,
    k.maxDevices,
    `"${k.batchTag || ''}"`,
    k.createdAt
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,' + [header.join(','), ...rows.map(e => e.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `license_batch_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('CSV downloaded successfully!', 'success');
}

// ==========================================
// 10. Releases & Remote Updates
// ==========================================
async function fetchReleases() {
  if (!authToken) return;
  try {
    const res = await fetch('/api/v1/releases', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    if (data.success) {
      renderReleasesFeed(data.releases || []);
    }
  } catch (err) {
    console.error('Error fetching releases:', err);
  }
}

function renderReleasesFeed(releases) {
  const container = document.getElementById('devReleasesFeed');
  if (!container) return;

  if (releases.length === 0) {
    container.innerHTML = `<div style="color:var(--text-dim); font-size:0.85rem; padding:1.5rem;">No updates broadcasted yet.</div>`;
    return;
  }

  container.innerHTML = releases.map(rel => {
    const pubDate = new Date(rel.releaseDate || Date.now()).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    return `
      <div class="release-item">
        <div class="release-top">
          <div>
            <strong style="color:var(--text-main); font-size:0.95rem;">${escapeHtml(rel.product)}</strong>
            <span class="release-badge">v${escapeHtml(rel.version)}</span>
            ${rel.mandatory ? '<span class="badge badge-revoked" style="margin-left:6px;">Mandatory</span>' : ''}
          </div>
          <span style="font-size:0.75rem; color:var(--text-dim);">${pubDate}</span>
        </div>
        <p class="release-desc">${escapeHtml(rel.changelog || 'No release notes provided.')}</p>
        <a href="${escapeHtml(rel.downloadUrl)}" target="_blank" class="release-link">
          🔗 Download Link (${escapeHtml(rel.downloadUrl)})
        </a>
      </div>
    `;
  }).join('');
}

async function handlePublishReleaseSubmit(e) {
  e.preventDefault();
  const product = document.getElementById('relProduct').value;
  const version = document.getElementById('relVersion').value.trim();
  const mandatory = document.getElementById('relMandatory').checked;
  const rawDownloadUrl = document.getElementById('relDownloadUrl').value.trim();
  const downloadUrl = formatDownloadUrl(rawDownloadUrl);
  const changelog = document.getElementById('relChangelog').value.trim();

  try {
    const res = await fetch('/api/v1/releases/publish', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ product, version, mandatory, downloadUrl, changelog })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Update v${version} broadcasted successfully!`, 'success');
      e.target.reset();
      fetchReleases();
      fetchProducts();
      fetchStats();
    } else {
      showToast(data.message || 'Failed to publish', 'error');
    }
  } catch (err) {
    showToast('Network error', 'error');
  }
}

// ==========================================
// 11. Simulator Sandbox
// ==========================================
async function handleSimulateActivate() {
  const key = document.getElementById('simKey').value.trim();
  const hwid = document.getElementById('simHwid').value.trim();
  const deviceName = document.getElementById('simDeviceName').value.trim();
  const out = document.getElementById('simResponseOutput');

  out.textContent = '// Sending client activation request...';

  try {
    const res = await fetch('/api/v1/client/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: key, hwid, deviceName })
    });
    const data = await res.json();
    out.textContent = JSON.stringify(data, null, 2);
    fetchLicenses();
    fetchStats();
  } catch (err) {
    out.textContent = '// Error communicating with server:\n' + err.message;
  }
}

async function handleSimulateCheckUpdate() {
  const out = document.getElementById('simResponseOutput');
  const prod = cachedProducts[0] ? cachedProducts[0].name : 'AutoSaviour Pro';
  out.textContent = `// Checking updates for ${prod}...`;

  try {
    const res = await fetch(`/api/v1/client/check-update?product=${encodeURIComponent(prod)}&currentVersion=1.0.0`);
    const data = await res.json();
    out.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    out.textContent = '// Error checking updates:\n' + err.message;
  }
}

// ==========================================
// 12. Helpers
// ==========================================
window.copyApiKey = function() {
  if (currentUser && currentUser.apiKey) {
    navigator.clipboard.writeText(currentUser.apiKey).then(() => {
      showToast('API Key copied to clipboard!', 'success');
    });
  }
};

window.copyText = function(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast(`Copied: ${text}`, 'success');
  });
};

window.copySnippet = function(id) {
  const el = document.getElementById(id);
  if (el) {
    navigator.clipboard.writeText(el.innerText).then(() => {
      showToast('Code snippet copied!', 'success');
    });
  }
};

function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;

  toast.textContent = msg;
  toast.className = `toast ${type} show`;

  setTimeout(() => {
    toast.className = 'toast';
  }, 3200);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

window.switchSdkTab = function(platform) {
  // Update button active state
  document.querySelectorAll('.sdk-tab-btn').forEach(btn => {
    if (btn.getAttribute('onclick').includes(platform)) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Update panels
  document.querySelectorAll('.sdk-panel').forEach(panel => {
    panel.classList.remove('active');
  });

  const target = document.getElementById(`sdk-${platform}`);
  if (target) {
    target.classList.add('active');
  }
};

function updateSdkServerUrls() {
  try {
    const isHttp = window.location.protocol.startsWith('http');
    const currentOrigin = (isHttp && window.location.origin) 
      ? window.location.origin 
      : 'https://codebox-n8kk.onrender.com';

    const snippetIds = ['codeCepFull', 'codeCSharp', 'codePython', 'codeElectron', 'codeCpp', 'codePhp', 'codeRest'];
    snippetIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.innerHTML = el.innerHTML
          .replace(/http:\/\/localhost:4000/g, currentOrigin);
      }
    });

    const whCheckout = document.getElementById('txtUniversalWebhookUrl');
    if (whCheckout) whCheckout.textContent = `${currentOrigin}/api/v1/webhooks/checkout`;
    const whGumroad = document.getElementById('txtGumroadWebhookUrl');
    if (whGumroad) whGumroad.textContent = `${currentOrigin}/api/v1/webhooks/gumroad`;
    const whLemon = document.getElementById('txtLemonWebhookUrl');
    if (whLemon) whLemon.textContent = `${currentOrigin}/api/v1/webhooks/lemonsqueezy`;
  } catch (e) {
    console.warn('Failed to update SDK server URLs:', e);
  }
}

// ==========================================
// 7. Geo-IP Telemetry Rendering
// ==========================================
function renderGeoDistribution(geoDist) {
  const container = document.getElementById('geoDistributionGrid');
  if (!container) return;

  const entries = Object.entries(geoDist);
  if (entries.length === 0) {
    container.innerHTML = `<div style="color: var(--text-dim); font-size: 0.85rem; padding: 1rem 0;">No active devices detected yet. Activations will automatically map to country locations here.</div>`;
    return;
  }

  container.innerHTML = entries.map(([countryWithFlag, count]) => `
    <div class="geo-country-card">
      <div class="geo-country-info">
        <span class="geo-name">${escapeHtml(countryWithFlag)}</span>
      </div>
      <span class="geo-count">${count} Device${count > 1 ? 's' : ''}</span>
    </div>
  `).join('');
}

// ==========================================
// 8. Remote In-App Notices Controller
// ==========================================
async function fetchNotices() {
  if (!authToken) return;
  try {
    const res = await fetch('/api/v1/notices', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    if (data.success) {
      renderNoticesList(data.notices || []);
    }
  } catch (err) {
    console.error('Error fetching notices:', err);
  }
}

function renderNoticesList(notices) {
  const container = document.getElementById('noticeListContainer');
  if (!container) return;

  if (notices.length === 0) {
    container.innerHTML = `<div style="color:var(--text-dim); font-size:0.85rem; padding:1.5rem; text-align:center;">No announcements created yet. Use the form on the left to broadcast your first in-app notice!</div>`;
    return;
  }

  container.innerHTML = notices.map(n => {
    const createdDate = new Date(n.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    const isPromo = n.type === 'promo';
    const isWarning = n.type === 'warning';
    const typeLabel = isPromo ? '🎁 Promo Offer' : isWarning ? '⚠️ Alert' : 'ℹ️ General News';

    return `
      <div class="notice-card ${n.type || 'promo'}">
        <div class="notice-card-header">
          <div>
            <strong class="notice-card-title">${escapeHtml(n.title)}</strong>
            <span class="badge ${n.active ? 'badge-active' : 'badge-revoked'}" style="margin-left:6px;">${n.active ? 'Broadcasting Live' : 'Paused'}</span>
            <span class="badge badge-info" style="margin-left:4px;">${escapeHtml(n.product || 'ALL')}</span>
          </div>
          <span style="font-size:0.75rem; color:var(--text-dim);">${typeLabel}</span>
        </div>
        <p class="notice-card-msg">${escapeHtml(n.message)}</p>
        <div class="notice-card-footer">
          <span>${n.actionText ? `Button: <b>${escapeHtml(n.actionText)}</b>` : 'No action button'} • ${createdDate}</span>
          <div class="notice-card-actions">
            <button class="btn btn-secondary btn-sm" onclick="handleToggleNotice('${escapeHtml(n.id)}')">
              ${n.active ? 'Pause' : 'Activate'}
            </button>
            <button class="btn btn-danger btn-sm" onclick="handleDeleteNotice('${escapeHtml(n.id)}')">Delete</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function handleCreateNoticeSubmit(e) {
  e.preventDefault();
  const product = document.getElementById('noticeProductSelect').value;
  const type = document.getElementById('noticeType').value;
  const title = document.getElementById('noticeTitle').value.trim();
  const message = document.getElementById('noticeMsg').value.trim();
  const actionText = document.getElementById('noticeActionText').value.trim();
  const actionUrl = document.getElementById('noticeActionUrl').value.trim();

  try {
    const res = await fetch('/api/v1/notices', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ product, type, title, message, actionText, actionUrl, active: true })
    });
    const data = await res.json();
    if (data.success) {
      showToast('🎉 In-app notice broadcasted live!', 'success');
      document.getElementById('formCreateNotice').reset();
      fetchNotices();
    } else {
      showToast(data.message || 'Failed to create notice', 'error');
    }
  } catch (err) {
    showToast('Network error while publishing notice', 'error');
  }
}

window.handleToggleNotice = async function(id) {
  try {
    const res = await fetch(`/api/v1/notices/${id}/toggle`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      fetchNotices();
    }
  } catch (e) {
    showToast('Failed to toggle notice status', 'error');
  }
};

window.handleDeleteNotice = async function(id) {
  if (!confirm('Are you sure you want to delete this announcement?')) return;
  try {
    const res = await fetch(`/api/v1/notices/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    if (data.success) {
      showToast('Notice deleted', 'success');
      fetchNotices();
    }
  } catch (e) {
    showToast('Failed to delete notice', 'error');
  }
};

// ==========================================
// 9. Auto-Pilot Webhooks Controller
// ==========================================
window.copyWebhookUrl = function(elemId) {
  const el = document.getElementById(elemId);
  if (!el) return;
  copyText(el.textContent.trim());
};

async function fetchWebhookLogs() {
  if (!authToken) return;
  try {
    const res = await fetch('/api/v1/webhooks/logs', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    if (data.success) {
      renderWebhookDeliveries(data.logs || []);
    }
  } catch (err) {
    console.error('Error fetching webhook deliveries:', err);
  }
}

function renderWebhookDeliveries(logs) {
  const container = document.getElementById('webhookDeliveriesList');
  if (!container) return;

  if (logs.length === 0) {
    container.innerHTML = `<div style="color:var(--text-dim); font-size:0.85rem; padding:1.5rem; text-align:center;">No automated deliveries recorded yet. Paste your webhook URL in Gumroad or LemonSqueezy, or run a test purchase on the left!</div>`;
    return;
  }

  container.innerHTML = logs.map(l => {
    const timeFormatted = new Date(l.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateFormatted = new Date(l.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });

    return `
      <div class="audit-item">
        <div class="audit-left">
          <div class="audit-action">
            <span class="badge badge-active">${escapeHtml(l.source || 'Webhook')}</span>
            <strong style="margin-left:6px; color:var(--text-main); font-size:0.9rem;">${escapeHtml(l.customer)}</strong>
            <span style="font-size:0.75rem; color:var(--text-dim);">(${escapeHtml(l.email)})</span>
          </div>
          <div class="audit-meta">
            Product: <strong>${escapeHtml(l.product)}</strong> • Key: <span class="key-mono" onclick="copyText('${escapeHtml(l.key)}')">${escapeHtml(l.key)}</span>
          </div>
        </div>
        <div class="audit-time">${dateFormatted} ${timeFormatted}</div>
      </div>
    `;
  }).join('');
}

async function handleSimulateWebhookSubmit(e) {
  e.preventDefault();
  const product = document.getElementById('simWhProduct').value || 'AutoSaviour Pro';
  const customerName = document.getElementById('simWhCustomerName').value.trim();
  const customerEmail = document.getElementById('simWhCustomerEmail').value.trim();
  const source = document.getElementById('simWhSource').value;

  try {
    const res = await fetch('/api/v1/webhooks/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        product,
        customerName,
        customerEmail,
        source,
        orderId: 'SIM-' + Date.now().toString(36).toUpperCase()
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`⚡ Purchase Simulated! Generated Key: ${data.licenseKey}`, 'success');
      fetchWebhookLogs();
      fetchLicenses();
      fetchStats();
    } else {
      showToast(data.message || 'Webhook simulation failed', 'error');
    }
  } catch (err) {
    showToast('Failed to simulate webhook', 'error');
  }
}

