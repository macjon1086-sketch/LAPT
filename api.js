// api.js — main application script (adapted from the 'script' file in the Apps Script project)
//
// NOTE:
// - Many functions in the original project used google.script.run (Apps Script client-server).
// - This file preserves function names and structure so it works when embedded into the Apps Script web app.
// - In a plain static web-hosted repo you will need to replace google.script.run calls with your own API calls
//   (fetch/XHR to your backend) or mock them for local development.


// ----------- CACHED ELEMENTS & VARIABLES -----------
const cachedElements = {};
let currentAppNumber = "";
let currentAppFolderId = "";
let lastAppCount = 0;
let notificationCheckInterval;
let refreshInterval;
let _startButtonOriginalHTML = null;
let _startButtonRestoreTimer = null;
let currentViewingAppData = null;

function cacheElements() {
  const elements = {
    'login-modal': 'login-modal',
    'logged-in-user': 'logged-in-user',
    'current-date': 'current-date',
    'loading': 'loading',
    'success-modal': 'success-modal',
    'success-message': 'success-message',
    'app-number': 'app-number',
    'user-notification-badge': 'user-notification-badge',
    'start-new-application-card-btn': 'start-new-application-card-btn',
    'start-new-application-btn': 'start-new-application-btn',
    'viewApplicationModal': 'viewApplicationModal'
  };
  for (const [key, id] of Object.entries(elements)) {
    cachedElements[key] = document.getElementById(id);
  }
  if (!_startButtonOriginalHTML && cachedElements['start-new-application-card-btn']) {
    _startButtonOriginalHTML = cachedElements['start-new-application-card-btn'].innerHTML;
  }
}

// Communication handler (kept minimal)
function handleNewApplicationSave(appNumber, formData) {
  showLoading();
  const userName = localStorage.getItem('loggedInName');

  if (window.google && google.script && google.script.run) {
    google.script.run
      .withSuccessHandler(function(response) {
        hideLoading();
        if (response.success) {
          showSuccessModal('Application saved successfully!');
          updateBadgeCounts();
          updateUserNotificationBadge();
          const modal = document.getElementById('newApplicationModal');
          if (modal) modal.style.display = 'none';
          if (typeof refreshApplications === 'function') refreshApplications();
          markApplicationSaved(appNumber, formData.name || '', false);
        } else {
          alert('Error: ' + response.message);
        }
      })
      .withFailureHandler(function(error) {
        hideLoading();
        alert('Error saving application: ' + error.message);
      })
      .saveProcessApplicationForm(appNumber, formData);
  } else {
    hideLoading();
    alert('Saving requires Apps Script server-side runtime (google.script.run).');
  }
}

function closeModal() {
  const modal = document.getElementById('newApplicationModal');
  if (modal) modal.style.display = 'none';
}

document.addEventListener('DOMContentLoaded', function() {
  const modal = document.getElementById('newApplicationModal');
  if (modal) {
    window.addEventListener('click', function(event) {
      if (event.target === modal) closeModal();
    });
  }
});

// debounce helper
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => { clearTimeout(timeout); func(...args); };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// start button helpers (visual feedback)
function setStartButtonToTemporaryLabel(label, durationMs = 3000) {
  const btn = cachedElements['start-new-application-card-btn'] || document.getElementById('start-new-application-card-btn');
  if (!btn) return;
  if (_startButtonRestoreTimer) { clearTimeout(_startButtonRestoreTimer); _startButtonRestoreTimer = null; }
  if (!_startButtonOriginalHTML) _startButtonOriginalHTML = btn.innerHTML;
  btn.innerHTML = `<i class="fas fa-check-circle"></i> ${label}`;
  btn.disabled = true;
  btn.classList.add('btn-template-disabled');
  const topBtn = cachedElements['start-new-application-btn'] || document.getElementById('start-new-application-btn');
  if (topBtn) { topBtn.innerHTML = `<i class="fas fa-check-circle"></i> ${label}`; topBtn.disabled = true; topBtn.classList.add('btn-template-disabled'); }
  _startButtonRestoreTimer = setTimeout(() => { restoreStartButton(); }, durationMs);
}

function restoreStartButton() {
  const btn = cachedElements['start-new-application-card-btn'] || document.getElementById('start-new-application-card-btn');
  const topBtn = cachedElements['start-new-application-btn'] || document.getElementById('start-new-application-btn');
  if (btn) { btn.innerHTML = _startButtonOriginalHTML || '<i class="fas fa-plus-circle"></i> Start New Application'; btn.disabled = false; btn.classList.remove('btn-template-disabled'); }
  if (topBtn) { topBtn.innerHTML = '<i class="fas fa-plus"></i> Start New Application'; topBtn.disabled = false; topBtn.classList.remove('btn-template-disabled'); }
  if (_startButtonRestoreTimer) { clearTimeout(_startButtonRestoreTimer); _startButtonRestoreTimer = null; }
}

function markApplicationSaved(appNumber, applicantName, auto = false) {
  setStartButtonToTemporaryLabel(auto ? 'Auto Saved' : 'Saved', 3000);
  resetCurrentAppNumber();
  try {
    const detailsEl = document.getElementById('app-details-content');
    if (detailsEl) {
      detailsEl.innerHTML = `<div class="detail-card"><h3>Application ${appNumber} saved${applicantName ? ' — ' + escapeHtml(applicantName) : ''}.</h3></div>`;
    }
  } catch (e) {}
}

function resetCurrentAppNumber() {
  currentAppNumber = '';
  currentAppFolderId = '';
  if (cachedElements['app-number']) cachedElements['app-number'].textContent = '';
}

function escapeHtml(s) { if (!s) return ''; return s.toString().replace(/[&<>\"']/g, function(m){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m]; }); }

// AUTH & LOGIN
function showLoginModal() { if (cachedElements['login-modal']) cachedElements['login-modal'].style.display = 'flex'; if (cachedElements['logged-in-user']) cachedElements['logged-in-user'].textContent = ''; document.querySelectorAll('content-section').forEach(section => section.classList.remove('active')); }
function hideLoginModal() { if (cachedElements['login-modal']) cachedElements['login-modal'].style.display = 'none'; }
function logout() {
  if (confirm('Are you sure you want to logout?')) {
    localStorage.removeItem('loggedInName');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userLevel');
    clearIntervals();
    showLoginModal();
  }
}
function setLoggedInUser(name, role = '') {
  const userElement = cachedElements['logged-in-user'];
  if (userElement) userElement.textContent = role ? `${name} (${role})` : name;
  if (name) updateUserNotificationBadge();
}
function restrictIfNotLoggedIn() {
  const loggedInName = localStorage.getItem('loggedInName');
  if (!loggedInName) { showLoginModal(); return true; }
  return false;
}
function updateUserNotificationBadge() {
  const userName = localStorage.getItem('loggedInName');
  if (!userName) return;
  if (window.google && google.script && google.script.run) {
    google.script.run.withSuccessHandler(function(count) {
      const badge = cachedElements['user-notification-badge'];
      if (badge) {
        if (count > 0) { badge.textContent = count > 99 ? '99+' : count; badge.style.display = 'flex'; }
        else { badge.style.display = 'none'; }
      }
    }).withFailureHandler(function(e){ console.error('Error updating badge:', e); }).getApplicationsCountForUser(userName);
  }
}

// PAGE INIT
function clearIntervals() { if (notificationCheckInterval) clearInterval(notificationCheckInterval); if (refreshInterval) clearInterval(refreshInterval); }
window.addEventListener('load', function() {
  localStorage.removeItem('loggedInName');
  localStorage.removeItem('userRole');
  localStorage.removeItem('userLevel');
  clearIntervals();
});
document.addEventListener('DOMContentLoaded', function() {
  cacheElements();
  if (cachedElements['current-date']) cachedElements['current-date'].textContent = new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  initializeBrowserNotifications();
  document.addEventListener('visibilitychange', handleVisibilityChange);
  const loggedInName = localStorage.getItem('loggedInName');
  if (!loggedInName) { showLoginModal(); }
  else { verifyUserOnLoad(loggedInName); }
});

function verifyUserOnLoad(loggedInName) {
  if (window.google && google.script && google.script.run) {
    google.script.run.withSuccessHandler(function(authResult) {
      if (authResult.success) {
        const userRole = localStorage.getItem('userRole');
        setLoggedInUser(loggedInName, userRole);
        hideLoginModal();
        document.querySelectorAll('.content-section').forEach(section => section.classList.remove('active'));
        document.getElementById('new').classList.add('active');
        initializeAppCount();
        initializeAndRefreshTables();
      } else {
        localStorage.removeItem('loggedInName'); localStorage.removeItem('userRole'); localStorage.removeItem('userLevel'); showLoginModal();
      }
    }).withFailureHandler(function(){ localStorage.removeItem('loggedInName'); localStorage.removeItem('userRole'); localStorage.removeItem('userLevel'); showLoginModal(); }).authenticateUser(loggedInName);
  } else {
    // Demo fallback
    setLoggedInUser('demo user', 'Demo');
    hideLoginModal();
    document.querySelectorAll('.content-section').forEach(section => section.classList.remove('active'));
    document.getElementById('new').classList.add('active');
    initializeAppCount();
    initializeAndRefreshTables();
  }
}

// login form handler (the index.html contains a login modal form — adapt if exists)
document.addEventListener('DOMContentLoaded', function() {
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', function(e) {
      e.preventDefault();
      const name = document.getElementById('login-name').value.trim();
      if (!name) { alert('Name is required!'); return; }
      showLoading();
      if (window.google && google.script && google.script.run) {
        google.script.run.withSuccessHandler(function(authResult) {
          hideLoading();
          if (authResult.success) { handleSuccessfulLogin(name, authResult.user); }
          else { handleFailedLogin(authResult.message); }
        }).withFailureHandler(function(error) { hideLoading(); alert('Login error: ' + error.message); document.getElementById('login-name').value=''; document.getElementById('login-name').focus(); }).authenticateUser(name);
      } else {
        hideLoading();
        handleSuccessfulLogin(name, { role:'Demo', level:1 });
      }
    });
  }
});

function handleSuccessfulLogin(name, user) {
  localStorage.setItem('loggedInName', name);
  localStorage.setItem('userRole', user.role);
  localStorage.setItem('userLevel', user.level);
  setLoggedInUser(name, user.role);
  hideLoginModal();
  document.querySelectorAll('.content-section').forEach(section => section.classList.remove('active'));
  document.getElementById('new').classList.add('active');
  initializeAppCount();
  initializeAndRefreshTables();
  initializeBrowserNotifications();
}
function handleFailedLogin(message) { alert(message || 'Authentication failed'); const input = document.getElementById('login-name'); if (input) { input.value=''; input.focus(); } }

// NAV
const debouncedShowSection = debounce(function(sectionId) {
  if (restrictIfNotLoggedIn()) return;
  document.querySelectorAll('.content-section').forEach(section => section.classList.remove('active'));
  const el = document.getElementById(sectionId);
  if (el) el.classList.add('active');
  document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.querySelector(`.menu-btn[onclick*="showSection('${sectionId}')"], .menu-btn[onclick*="showSection(\"${sectionId}\")"]`);
  if (activeBtn) activeBtn.classList.add('active');
  if (sectionId === 'users-list') refreshUsersList();
}, 150);
function showSection(sectionId) { debouncedShowSection(sectionId); }

// Application logic — simplified for repo/demo
function startNewApplication() {
  if (window.google && google.script && google.script.run) {
    google.script.run.withSuccessHandler(function(ctx) {
      currentAppNumber = ctx.appNumber; currentAppFolderId = ctx.folderId;
      if (cachedElements['app-number']) cachedElements['app-number'].textContent = currentAppNumber;
    }).getNewApplicationContext();
  } else {
    currentAppNumber = 'LOCAL-' + Date.now();
    if (cachedElements['app-number']) cachedElements['app-number'].textContent = currentAppNumber;
  }
}

function updateBadgeCount(status, count) {
  const badgeElement = document.getElementById(status + '-count');
  if (badgeElement) {
    badgeElement.textContent = count;
    badgeElement.style.display = count > 0 ? 'inline-block' : 'none';
  }
}
const format = {
  date: date => date ? new Date(date).toLocaleDateString('en-US', {year:'numeric', month:'short', day:'numeric'}) : '',
  currency: amount => {
    if (amount === null || amount === undefined) return '0.00';
    const num = parseFloat(amount);
    return isNaN(num) ? '0.00' : num.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 });
  }
};

function downloadLendingTemplate() {
  if (!currentAppNumber || !currentAppFolderId) { alert('Application number/folder not set.'); return; }
  showLoading();
  if (window.google && google.script && google.script.run) {
    google.script.run.withSuccessHandler(function(url){ hideLoading(); window.open(url, '_blank'); }).copyLendingTemplate(currentAppNumber, currentAppFolderId);
  } else {
    hideLoading();
    alert('Download requires server-side support.');
  }
}

function showLoading() { if (cachedElements['loading']) cachedElements['loading'].style.display = 'flex'; }
function hideLoading() { if (cachedElements['loading']) cachedElements['loading'].style.display = 'none'; }

function saveDraft() {
  const appObj = { appNumber: currentAppNumber };
  showLoading();
  const userName = localStorage.getItem('loggedInName');
  if (window.google && google.script && google.script.run) {
    google.script.run.withSuccessHandler(function(res) { hideLoading(); showSuccessModal(res.message || 'Draft saved!'); updateUserNotificationBadge(); showSection('new'); }).saveApplicationDraft(appObj, userName);
  } else {
    hideLoading();
    showSuccessModal('Draft saved (demo)');
  }
}

document.addEventListener('DOMContentLoaded', function(){
  const applicationForm = document.getElementById('application-form');
  if (applicationForm) {
    applicationForm.addEventListener('submit', function(e) {
      e.preventDefault();
      showLoading();
      const userName = localStorage.getItem('loggedInName');
      if (window.google && google.script && google.script.run) {
        google.script.run.withSuccessHandler(function(res){ hideLoading(); showSuccessModal(res.message || 'Application submitted!'); updateUserNotificationBadge(); resetApplicationForm(); showSection('new'); }).submitApplication({ appNumber: currentAppNumber }, userName);
      } else {
        hideLoading();
        showSuccessModal('Application submitted (demo)');
      }
    });
  }
});

function resetApplicationForm() {
  const form = document.getElementById('application-form');
  if (form) form.reset();
  ['bank-statement-name','pay-slip-name','undertaking-name','loan-statement-name'].forEach(id => {
    const el = document.getElementById(id); if (el) { el.textContent = 'No file chosen'; el.style.color = ''; }
  });
  currentAppNumber = ""; currentAppFolderId = "";
  if (cachedElements['app-number']) cachedElements['app-number'].textContent = "";
}

function triggerFileUpload(inputId) { const input = document.getElementById(inputId); if (input) input.click(); }

// TABLES & listing: simplified/populateTable
function getStatusBadgeClass(status) {
  const statusMap = { 'DRAFT':'status-draft','NEW':'status-new','PENDING':'status-pending','PENDING APPROVAL':'status-pending','APPROVED':'status-approved','COMPLETE':'status-approved' };
  return statusMap[status] || 'status-pending';
}

function populateTable(tableId, statusFunction, options = {}) {
  const { showLoading = true } = options;
  const tbody = document.querySelector(`#${tableId}`);
  if (!tbody) { console.error(`Table body not found: ${tableId}`); return; }
  if (showLoading) { tbody.innerHTML = `<tr><td colspan="5" class="loading">Loading applications...</td></tr>`; }
  else { tbody.setAttribute('aria-busy','true'); tbody.style.opacity = '0.7'; }

  const onSuccess = function(data) {
    tbody.removeAttribute('aria-busy'); tbody.style.opacity = '1';
    const filteredData = Array.isArray(data) ? data.filter(row => row?.appNumber?.toString().trim()) : [];
    if (!filteredData.length) { tbody.innerHTML = `<tr><td colspan="5" class="no-data">No applications found</td></tr>`; return; }
    const fragment = document.createDocumentFragment();
    filteredData.forEach(row => {
      const appNumber = row.appNumber || '';
      const tr = document.createElement('tr');
      const tdApp = document.createElement('td'); tdApp.className = 'app-number';
      const a = document.createElement('a'); a.href = 'javascript:void(0)'; a.className = 'app-number-link'; a.textContent = appNumber;
      a.addEventListener('click', function(){ handleAppNumberClick(appNumber); });
      tdApp.appendChild(a); tr.appendChild(tdApp);
      const tdName = document.createElement('td'); tdName.className = 'applicant-name'; tdName.textContent = row.applicantName || 'N/A'; tr.appendChild(tdName);
      const tdAmount = document.createElement('td'); tdAmount.className = 'amount'; tdAmount.textContent = format.currency(row.amount); tr.appendChild(tdAmount);
      const tdDate = document.createElement('td'); tdDate.className = 'date'; tdDate.textContent = row.date ? format.date(row.date) : 'N/A'; tr.appendChild(tdDate);
      const tdActionBy = document.createElement('td'); tdActionBy.className = 'action-by'; tdActionBy.textContent = row.actionBy || 'N/A'; tr.appendChild(tdActionBy);
      fragment.appendChild(tr);
    });
    tbody.replaceChildren(fragment);
  };

  const onFailure = function(error) {
    tbody.removeAttribute('aria-busy'); tbody.style.opacity = '1';
    if (!tbody.children.length) tbody.innerHTML = `<tr><td colspan="5" class="error">Error loading data: ${error?.message || 'Unknown error'}</td></tr>`;
    else console.error('Error populating table (background refresh kept existing rows):', error);
  };

  const statusFunctions = {
    'getNewApplications': google && google.script && google.script.run ? google.script.run.withSuccessHandler(onSuccess).withFailureHandler(onFailure).getNewApplications : null,
    'getPendingApplications': google && google.script && google.script.run ? google.script.run.withSuccessHandler(onSuccess).withFailureHandler(onFailure).getPendingApplications : null,
    'getPendingApprovalApplications': google && google.script && google.script.run ? google.script.run.withSuccessHandler(onSuccess).withFailureHandler(onFailure).getPendingApprovalApplications : null,
    'getApprovedApplications': google && google.script && google.script.run ? google.script.run.withSuccessHandler(onSuccess).withFailureHandler(onFailure).getApprovedApplications : null
  };
  if (statusFunctions[statusFunction]) statusFunctions[statusFunction]();
}

function handleAppNumberClick(appNumber) {
  if (!appNumber || appNumber === 'undefined' || appNumber === 'null') { alert('Error: Invalid application number'); return; }
  const userName = localStorage.getItem('loggedInName');
  showLoading();
  if (window.google && google.script && google.script.run) {
    google.script.run
      .withSuccessHandler(function(response) {
        hideLoading();
        if (response && response.success && response.data) {
          const appData = response.data;
          if (appData.status === 'NEW' && appData.completionStatus === 'DRAFT') {
            showNewApplicationModal(appNumber);
          } else {
            openViewApplicationModal(appData);
          }
        } else {
          alert('Failed to load application: ' + (response?.message || 'Application not found'));
        }
      })
      .withFailureHandler(function(error) {
        hideLoading();
        if (error?.message?.includes('Application not found')) alert('Application not found: ' + appNumber + '. Please try refreshing the list.');
        else if (error?.message?.includes('not authorized')) alert('You are not authorized to view this application.');
        else alert('Error loading application details: ' + (error?.message || error));
      })
      .getApplicationDetails(appNumber, userName);
  } else {
    hideLoading();
    alert('Viewing an application requires server-side support (Apps Script). Demo/local mode cannot open details.');
  }
}

// view modal helpers
function openViewApplicationModal(appData) {
  currentViewingAppData = appData;
  sessionStorage.setItem('currentViewingApp', appData.appNumber);
  const modal = cachedElements['viewApplicationModal'];
  if (modal) { modal.style.display = 'block'; document.body.style.overflow = 'hidden'; }
  if (typeof window.initViewApplicationModal === 'function') window.initViewApplicationModal(appData);
}
function closeViewApplicationModal() {
  if (cachedElements['viewApplicationModal']) { cachedElements['viewApplicationModal'].style.display = 'none'; document.body.style.overflow = 'auto'; currentViewingAppData = null; sessionStorage.removeItem('currentViewingApp'); }
}
window.closeViewApplicationModal = closeViewApplicationModal;

// load applications mapping
function loadApplications(sectionId, options = { showLoading: true }) {
  const sectionMap = {
    'new': ['new-list','getNewApplications'],
    'pending': ['pending-list','getPendingApplications'],
    'pending-approvals': ['pending-approvals-list','getPendingApprovalApplications'],
    'approved': ['approved-list','getApprovedApplications']
  };
  if (sectionMap[sectionId]) {
    const [tableId, statusFunction] = sectionMap[sectionId];
    populateTable(tableId, statusFunction, options);
  }
}
function updateBadgeCounts() {
  if (window.google && google.script && google.script.run) {
    google.script.run.withSuccessHandler(counts => {
      updateBadgeCount('new', counts.new);
      updateBadgeCount('pending', counts.pending);
      updateBadgeCount('pending-approvals', counts.pendingApprovals);
      updateBadgeCount('approved', counts.approved);
    }).withFailureHandler(error => { console.error('Error updating badge counts:', error); }).getAllApplicationCounts();
  }
}

const debouncedRefreshApplications = debounce(function() {
  const activeSection = document.querySelector('.content-section.active')?.id;
  if (activeSection && activeSection !== 'new-application') {
    loadApplications(activeSection, { showLoading: true });
    updateBadgeCounts();
    updateUserNotificationBadge();
  }
}, 300);
function refreshApplications() { debouncedRefreshApplications(); }

function initializeAndRefreshTables() {
  loadApplications('new', { showLoading: true });
  updateBadgeCounts(); updateUserNotificationBadge();
  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(() => {
    const activeSection = document.querySelector('.content-section.active')?.id;
    if (activeSection && activeSection !== 'new-application') {
      loadApplications(activeSection, { showLoading: false });
    }
    updateBadgeCounts(); updateUserNotificationBadge();
  }, 60000);
}

// user mgmt
function getAllUsersHandler(users) {
  const tbody = document.getElementById('users-list-body');
  if (!tbody) return;
  if (!users?.length) { tbody.innerHTML = `<tr><td colspan="4" class="no-data">No users found</td></tr>`; return; }
  tbody.innerHTML = users.map(user => `
    <tr>
      <td>${escapeHtml(user.name)}</td>
      <td>${escapeHtml(user.level)}</td>
      <td>${escapeHtml(user.role)}</td>
      <td class="actions">
        <button class="btn-icon btn-delete" title="Delete" onclick="deleteUser('${escapeHtml(user.name)}')"><i class="fas fa-trash"></i></button>
      </td>
    </tr>
  `).join('');
}
function populateUsersTable() { if (window.google && google.script && google.script.run) google.script.run.withSuccessHandler(getAllUsersHandler).getAllUsers(); else document.getElementById('users-list-body').innerHTML = '<tr><td colspan="4" class="no-data">Demo mode: no users loaded</td></tr>'; }
function refreshUsersList() { populateUsersTable(); }
const addUserForm = document.getElementById('add-user-form');
if (addUserForm) {
  addUserForm.addEventListener('submit', function(e) {
    e.preventDefault();
    const name = document.getElementById('new-user-name')?.value.trim();
    const level = document.getElementById('new-user-level')?.value;
    const role = document.getElementById('new-user-role')?.value;
    if (!name || !level || !role) { alert('Please fill all fields!'); return; }
    if (window.google && google.script && google.script.run) {
      google.script.run.withSuccessHandler(function(res){ showSuccessModal(res.message || 'User added!'); if (res.success) { showSection('users-list'); refreshUsersList(); }}).addUser({ name, level, role });
    } else {
      showSuccessModal('User added (demo)');
    }
  });
}
function deleteUser(userName) {
  if (!confirm('Are you sure you want to delete user: ' + userName + '?')) return;
  if (window.google && google.script && google.script.run) {
    google.script.run.withSuccessHandler(function(res){ showSuccessModal(res.message || 'User deleted!'); if (res.success) refreshUsersList(); }).deleteUser(userName);
  } else { showSuccessModal('User removed (demo)'); }
}

// success modal
function showSuccessModal(message) { if (cachedElements['success-message']) cachedElements['success-message'].textContent = message; if (cachedElements['success-modal']) cachedElements['success-modal'].style.display = 'flex'; }
function closeSuccessModal() { if (cachedElements['success-modal']) cachedElements['success-modal'].style.display = 'none'; }

// desktop notifications (demo)
function initializeBrowserNotifications() {
  if (!("Notification" in window)) return;
  switch (Notification.permission) {
    case "granted": setupNotificationListener(); break;
    case "denied": break;
    case "default": Notification.requestPermission().then(permission => { if (permission === "granted") setupNotificationListener(); }); break;
  }
}
function setupNotificationListener() {
  if (notificationCheckInterval) clearInterval(notificationCheckInterval);
  notificationCheckInterval = setInterval(function(){ checkForNewApplications(); }, 30000);
}
function checkForNewApplications() {
  const userName = localStorage.getItem('loggedInName');
  if (!userName || document.visibilityState === 'visible') return;
  if (window.google && google.script && google.script.run) {
    google.script.run.withSuccessHandler(function(currentCount) {
      const previousCount = lastAppCount;
      lastAppCount = currentCount;
      if (currentCount > previousCount && previousCount > 0) {
        const newCount = currentCount - previousCount;
        const userRole = localStorage.getItem('userRole') || '';
        showApplicationNotification(userName, userRole, newCount);
      }
    }).withFailureHandler(function(error){ console.error('Error checking applications:', error); }).getApplicationsCountForUser(userName);
  }
}
function showApplicationNotification(userName, userRole, count) {
  if (Notification.permission === "granted" && document.visibilityState !== 'visible') {
    const notification = new Notification("New Application Assignment", {
      body: `${userName} have ${count} application(s) for your action${userRole ? ` as ${userRole}` : ''}`,
      icon: "https://img.icons8.com/color/192/000000/loan.png",
      badge: "https://img.icons8.com/color/192/000000/loan.png",
      tag: "loan-application",
      requireInteraction: true
    });
    notification.onclick = function() { window.focus(); notification.close(); refreshApplications(); };
    setTimeout(() => { notification.close(); }, 10000);
  }
}
function handleVisibilityChange() {
  if (document.visibilityState === 'visible') { refreshApplications(); updateUserNotificationBadge(); }
  else {
    const userName = localStorage.getItem('loggedInName');
    if (userName && window.google && google.script && google.script.run) {
      google.script.run.withSuccessHandler(function(count){ lastAppCount = count; }).getApplicationsCountForUser(userName);
    }
  }
}
function initializeAppCount() {
  const userName = localStorage.getItem('loggedInName');
  if (userName && window.google && google.script && google.script.run) {
    google.script.run.withSuccessHandler(function(count){ lastAppCount = count; }).getApplicationsCountForUser(userName);
  } else {
    lastAppCount = 0;
  }
}
