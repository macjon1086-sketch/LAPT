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

// Cache frequently used elements
function cacheElements() {
  const elements = {
    'logged-in-user': 'logged-in-user',
    'current-date': 'current-date',
    'loading': 'loading',
    'success-modal': 'success-modal',
    'success-message': 'success-message',
    'app-number': 'app-number',
    'user-notification-badge': 'user-notification-badge',
    'viewApplicationModal': 'viewApplicationModal'
  };
  for (const [key, id] of Object.entries(elements)) {
    cachedElements[key] = document.getElementById(id);
  }
}

// ----------- DEBOUNCE HELPERS -----------
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// ----------- AUTH & LOGIN -----------
function showLoginPage() {
  document.body.classList.remove('logged-in');
  localStorage.removeItem('loggedInName');
  localStorage.removeItem('userRole');
  localStorage.removeItem('userLevel');
  clearIntervals();
}

function showDashboard() {
  document.body.classList.add('logged-in');
  const loggedInName = localStorage.getItem('loggedInName');
  const userRole = localStorage.getItem('userRole');
  if (loggedInName) {
    setLoggedInUser(loggedInName, userRole);
  }
}

function setLoggedInUser(name, role = '') {
  const userElement = cachedElements['logged-in-user'];
  if (userElement) {
    userElement.textContent = role ? `${name} (${role})` : name;
  }
  if (name) {
    updateUserNotificationBadge();
  }
}

function logout() {
  if (confirm('Are you sure you want to logout?')) {
    localStorage.removeItem('loggedInName');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userLevel');
    clearIntervals();
    showLoginPage();
  }
}

function restrictIfNotLoggedIn() {
  const loggedInName = localStorage.getItem('loggedInName');
  if (!loggedInName) {
    showLoginPage();
    return true;
  }
  return false;
}

// ----------- PAGE INITIALIZATION -----------
function clearIntervals() {
  if (notificationCheckInterval) clearInterval(notificationCheckInterval);
  if (refreshInterval) clearInterval(refreshInterval);
}

window.addEventListener('load', function() {
  localStorage.removeItem('loggedInName');
  localStorage.removeItem('userRole');
  localStorage.removeItem('userLevel');
  clearIntervals();
});

document.addEventListener('DOMContentLoaded', function() {
  cacheElements();
  if (cachedElements['current-date']) {
    cachedElements['current-date'].textContent = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  }
  
  initializeBrowserNotifications();
  document.addEventListener('visibilitychange', handleVisibilityChange);
  
  const loggedInName = localStorage.getItem('loggedInName');
  if (loggedInName) {
    verifyUserOnLoad(loggedInName);
  } else {
    showLoginPage();
  }
  
  // Setup login form
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      const name = document.getElementById('login-name').value.trim();
      if (!name) {
        alert('Name is required!');
        return;
      }
      await handleLoginFunction(name);
    });
  }
});

async function verifyUserOnLoad(loggedInName) {
  try {
    const authResult = await window.apiService.login(loggedInName);
    if (authResult.success) {
      localStorage.setItem('userRole', authResult.user?.role || '');
      localStorage.setItem('userLevel', authResult.user?.level || '');
      
      setLoggedInUser(loggedInName, authResult.user?.role);
      showDashboard();
      
      document.querySelectorAll('.content-section').forEach(section => section.classList.remove('active'));
      document.getElementById('new').classList.add('active');
      initializeAppCount();
      initializeAndRefreshTables();
    } else {
      showLoginPage();
    }
  } catch (error) {
    console.error('Verification error:', error);
    showLoginPage();
  }
}

// ----------- LOGIN FUNCTION -----------
async function handleLoginFunction(name) {
  try {
    showLoading();
    console.log('Attempting login for:', name);
    
    const response = await window.apiService.login(name);
    console.log('Login response:', response);
    
    hideLoading();
    
    if (response.success) {
      handleSuccessfulLogin(name, response.user);
    } else {
      handleFailedLogin(response.message);
    }
  } catch (error) {
    hideLoading();
    console.error('Login error details:', error);
    alert('Login error: ' + error.message);
  }
}

function handleSuccessfulLogin(name, user) {
  localStorage.setItem('loggedInName', name);
  localStorage.setItem('userRole', user.role);
  localStorage.setItem('userLevel', user.level);
  
  setLoggedInUser(name, user.role);
  showDashboard();
  
  document.querySelectorAll('.content-section').forEach(section => section.classList.remove('active'));
  document.getElementById('new').classList.add('active');
  initializeAppCount();
  initializeAndRefreshTables();
  initializeBrowserNotifications();
}

function handleFailedLogin(message) {
  alert(message || 'Authentication failed');
  const loginName = document.getElementById('login-name');
  if (loginName) {
    loginName.value = '';
    loginName.focus();
  }
}

// ----------- SECTION NAVIGATION -----------
const debouncedShowSection = debounce(function(sectionId) {
  if (restrictIfNotLoggedIn()) return;
  document.querySelectorAll('.content-section').forEach(section => section.classList.remove('active'));
  document.getElementById(sectionId).classList.add('active');
  document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.querySelector(`.menu-btn[onclick*="showSection('${sectionId}')"]`);
  if (activeBtn) activeBtn.classList.add('active');
  
  if (sectionId === 'users-list') refreshUsersList();
}, 150);

function showSection(sectionId) { 
  debouncedShowSection(sectionId); 
}

// ----------- APPLICATION LOGIC -----------
function updateBadgeCount(status, count) {
  const badgeElement = document.getElementById(status + '-count');
  if (badgeElement) {
    badgeElement.textContent = count;
    badgeElement.style.display = count > 0 ? 'inline-block' : 'none';
  }
}

const format = {
  date: date => date ? new Date(date).toLocaleDateString('en-US', {year: 'numeric', month: 'short', day: 'numeric'}) : '',
  currency: amount => {
    if (amount === null || amount === undefined) return '0.00';
    const num = parseFloat(amount);
    return isNaN(num) ? '0.00' : num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }
};

// ----------- LOADING FUNCTIONS -----------
function showLoading(message = 'Processing...') {
  const loadingEl = cachedElements['loading'];
  if (loadingEl) {
    const messageEl = loadingEl.querySelector('p');
    if (messageEl) {
      messageEl.textContent = message;
    }
    loadingEl.style.display = 'flex';
  }
}

function hideLoading() {
  const loadingEl = cachedElements['loading'];
  if (loadingEl) {
    loadingEl.style.display = 'none';
  }
}

// ----------- TABLES & APPLICATION LISTING -----------
function populateTable(tableId, applications) {
  const tbody = document.querySelector(`#${tableId}`);
  if (!tbody) {
    console.error(`Table body not found: ${tableId}`);
    return;
  }

  if (!applications || !applications.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="no-data">No applications found</td></tr>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  applications.forEach(row => {
    const appNumber = row.appNumber || '';
    const tr = document.createElement('tr');

    // App number cell with link
    const tdApp = document.createElement('td');
    tdApp.className = 'app-number';
    const a = document.createElement('a');
    a.href = 'javascript:void(0)';
    a.className = 'app-number-link';
    a.textContent = appNumber;
    a.addEventListener('click', function() { handleAppNumberClick(appNumber); });
    tdApp.appendChild(a);
    tr.appendChild(tdApp);

    // Applicant name
    const tdName = document.createElement('td');
    tdName.className = 'applicant-name';
    tdName.textContent = row.applicantName || 'N/A';
    tr.appendChild(tdName);

    // Amount
    const tdAmount = document.createElement('td');
    tdAmount.className = 'amount';
    tdAmount.textContent = format.currency(row.amount);
    tr.appendChild(tdAmount);

    // Date
    const tdDate = document.createElement('td');
    tdDate.className = 'date';
    tdDate.textContent = row.date ? format.date(row.date) : 'N/A';
    tr.appendChild(tdDate);

    // Action by
    const tdActionBy = document.createElement('td');
    tdActionBy.className = 'action-by';
    tdActionBy.textContent = row.actionBy || 'N/A';
    tr.appendChild(tdActionBy);

    fragment.appendChild(tr);
  });

  tbody.replaceChildren(fragment);
}

// ----------- APPLICATION CLICK HANDLER -----------
async function handleAppNumberClick(appNumber) {
  if (!appNumber || appNumber === 'undefined' || appNumber === 'null') {
    alert('Error: Invalid application number');
    return;
  }
  
  const userName = localStorage.getItem('loggedInName');
  showLoading();
  
  try {
    const response = await window.apiService.getApplicationDetails(appNumber, userName);
    hideLoading();
    
    if (response.success && response.data) {
      const appData = response.data;
      
      if (appData.status === 'NEW' && appData.completionStatus === 'DRAFT') {
        showNewApplicationModal(appNumber);
      } else {
        openViewApplicationModal(appData);
      }
    } else {
      alert('Failed to load application: ' + (response?.message || 'Application not found'));
    }
  } catch (error) {
    hideLoading();
    if (error?.message?.includes('Application not found')) {
      alert('Application not found: ' + appNumber + '. Please try refreshing the list.');
    } else if (error?.message?.includes('not authorized')) {
      alert('You are not authorized to view this application.');
    } else {
      alert('Error loading application details: ' + (error?.message || error));
    }
  }
}

// ----------- MODAL CONTENT LOADER -----------
/* Replace (or insert) these functions in Main.js */

/**
 * Robust loader for the New Application modal HTML.
 * - Tries to use file markers first ("[file content begin]" / "[file content end]").
 * - Falls back to extracting <body> content (if present).
 * - Falls back to using whole response.
 * - Copies HTML into #newApplicationModalContent and executes any inline scripts found inside.
 */
async function loadModalContent() {
  const modalContent = document.getElementById('newApplicationModalContent');
  if (!modalContent) {
    console.error('Modal content container not found: #newApplicationModalContent');
    return false;
  }

  // If already loaded, skip
  if (modalContent.innerHTML.trim() !== '') {
    console.log('Modal content already loaded');
    return true;
  }

  showLoading('Loading application form...');

  try {
    const response = await fetch('newApps.html');
    if (!response.ok) throw new Error(`Failed to fetch newApps.html: ${response.status}`);

    const html = await response.text();

    // Prefer explicit markers if present
    const startMarker = '[file content begin]';
    const endMarker = '[file content end]';
    const startIndex = html.indexOf(startMarker);
    const endIndex = html.indexOf(endMarker);

    let fragmentHtml = null;

    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      fragmentHtml = html.substring(startIndex + startMarker.length, endIndex);
    } else {
      // Fallback: extract <body> content if available
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      fragmentHtml = bodyMatch ? bodyMatch[1] : html;
    }

    modalContent.innerHTML = fragmentHtml;

    // Execute inline scripts that came with the fetched fragment.
    // This ensures any script tags inside newApps.html run.
    const scripts = Array.from(modalContent.querySelectorAll('script'));
    for (const s of scripts) {
      const newScript = document.createElement('script');
      if (s.src) {
        // external script reference — copy src so browser will load it
        newScript.src = s.src;
        newScript.async = false; // preserve execution order
        document.head.appendChild(newScript);
      } else {
        // inline script
        newScript.textContent = s.textContent;
        document.head.appendChild(newScript);
      }
      // remove original script tag to avoid duplication
      s.remove();
    }

    console.log('New application modal content loaded');
    return true;
  } catch (err) {
    console.error('Error loading new application modal content:', err);
    return false;
  } finally {
    hideLoading();
  }
}


/**
 * Loader for the View Application modal HTML.
 * Creates/uses #viewApplicationModalContent inside the modal and inserts fetched HTML.
 * Same fallback behavior as loadModalContent.
 */
async function loadViewModalContent() {
  const modalContent = document.getElementById('viewApplicationModalContent');
  if (!modalContent) {
    console.error('View modal content container not found: #viewApplicationModalContent');
    return false;
  }

  if (modalContent.innerHTML.trim() !== '') {
    console.log('View modal content already loaded');
    return true;
  }

  showLoading('Loading view form...');

  try {
    const response = await fetch('viewApps.html');
    if (!response.ok) throw new Error(`Failed to fetch viewApps.html: ${response.status}`);

    const html = await response.text();

    const startMarker = '[file content begin]';
    const endMarker = '[file content end]';
    const startIndex = html.indexOf(startMarker);
    const endIndex = html.indexOf(endMarker);

    let fragmentHtml = null;

    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      fragmentHtml = html.substring(startIndex + startMarker.length, endIndex);
    } else {
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      fragmentHtml = bodyMatch ? bodyMatch[1] : html;
    }

    modalContent.innerHTML = fragmentHtml;

    const scripts = Array.from(modalContent.querySelectorAll('script'));
    for (const s of scripts) {
      const newScript = document.createElement('script');
      if (s.src) {
        newScript.src = s.src;
        newScript.async = false;
        document.head.appendChild(newScript);
      } else {
        newScript.textContent = s.textContent;
        document.head.appendChild(newScript);
      }
      s.remove();
    }

    console.log('View application modal content loaded');
    return true;
  } catch (err) {
    console.error('Error loading view application modal content:', err);
    return false;
  } finally {
    hideLoading();
  }
}


/* Ensure modal element references are cached on DOM ready so other functions using cachedElements work */
document.addEventListener('DOMContentLoaded', function () {
  window.cachedElements = window.cachedElements || {};
  if (!window.cachedElements['newApplicationModal']) {
    window.cachedElements['newApplicationModal'] = document.getElementById('newApplicationModal');
  }
  if (!window.cachedElements['viewApplicationModal']) {
    window.cachedElements['viewApplicationModal'] = document.getElementById('viewApplicationModal');
  }
});

// ----------- VIEW APPLICATION MODAL -----------
/* in Main.js where you open the view modal (openViewApplicationModal) */
async function openViewApplicationModal(appData) {
  currentViewingAppData = appData;
  sessionStorage.setItem('currentViewingApp', appData.appNumber);

  // Ensure view modal HTML is loaded
  const viewLoaded = await loadViewModalContent();
  if (!viewLoaded) {
    alert('Failed to load view modal content. Please refresh the page.');
    return;
  }

  // cachedElements may have been set earlier — but to be safe get element
  const viewModalEl = document.getElementById('viewApplicationModal');
  if (viewModalEl) {
    viewModalEl.style.display = 'block';
    // don't lock body scroll per existing behavior
  }

  if (typeof window.initViewApplicationModal === 'function') {
    window.initViewApplicationModal(appData);
  }
}

function closeViewApplicationModal() {
  if (cachedElements['viewApplicationModal']) {
    cachedElements['viewApplicationModal'].style.display = 'none';
    document.body.style.overflow = 'auto';
    currentViewingAppData = null;
    sessionStorage.removeItem('currentViewingApp');
  }
}

window.closeViewApplicationModal = closeViewApplicationModal;

document.addEventListener('keydown', function(event) {
  if (event.key === 'Escape') {
    if (cachedElements['viewApplicationModal'] && 
        cachedElements['viewApplicationModal'].style.display === 'block') {
      closeViewApplicationModal();
    }
  }
});

if (cachedElements['viewApplicationModal']) {
  cachedElements['viewApplicationModal'].addEventListener('click', function(event) {
    if (event.target === this) {
      closeViewApplicationModal();
    }
  });
}

// ----------- LOAD APPLICATIONS -----------
async function loadApplications(sectionId, options = {}) {
  const sectionMap = {
    'new': 'NEW',
    'pending': 'PENDING',
    'pending-approvals': 'PENDING_APPROVAL',
    'approved': 'APPROVED'
  };
  
  const status = sectionMap[sectionId];
  if (!status) return;
  
  const tbody = document.getElementById(`${sectionId}-list`);
  if (!tbody) return;
  
  // Only show loading indicator if explicitly requested AND it's not an auto-refresh
  const isAutoRefresh = options.isAutoRefresh || false;
  
  if (options.showLoading !== false && !isAutoRefresh) {
    tbody.innerHTML = `<tr><td colspan="5" class="loading">Loading applications...</td></tr>`;
  } else {
    tbody.setAttribute('aria-busy', 'true');
    tbody.style.opacity = '0.7';
  }
  
  try {
    const response = await window.apiService.getApplications(status, {
      showLoading: false // API handles its own loading
    });
    
    tbody.removeAttribute('aria-busy');
    tbody.style.opacity = '1';
    
    if (response.success) {
      populateTable(`${sectionId}-list`, response.data);
    } else {
      tbody.innerHTML = `<tr><td colspan="5" class="error">Error: ${response.message}</td></tr>`;
    }
  } catch (error) {
    tbody.removeAttribute('aria-busy');
    tbody.style.opacity = '1';
    tbody.innerHTML = `<tr><td colspan="5" class="error">Error: ${error.message}</td></tr>`;
  }
}

// ----------- UPDATE BADGE COUNTS -----------
async function updateBadgeCounts() {
  try {
    const response = await window.apiService.getApplicationCounts();
    if (response.success && response.data) {
      const counts = response.data;
      updateBadgeCount('new', counts.new || 0);
      updateBadgeCount('pending', counts.pending || 0);
      updateBadgeCount('pending-approvals', counts.pendingApprovals || 0);
      updateBadgeCount('approved', counts.approved || 0);
    }
  } catch (error) {
    console.error('Error updating badge counts:', error);
  }
}

async function updateUserNotificationBadge() {
  const userName = localStorage.getItem('loggedInName');
  if (!userName) return;
  
  try {
    const response = await window.apiService.getApplicationCountsForUser(userName);
    const count = response.count || 0;
    const badge = document.getElementById('user-notification-badge');
    if (badge) {
      if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    }
  } catch (error) {
    console.error('Error updating badge:', error);
  }
}

const debouncedRefreshApplications = debounce(async function(isAutoRefresh = false) {
  const activeSection = document.querySelector('.content-section.active')?.id;
  if (activeSection && activeSection !== 'new-application') {
    await loadApplications(activeSection, { 
      showLoading: !isAutoRefresh,
      isAutoRefresh: isAutoRefresh 
    });
    await updateBadgeCounts();
    await updateUserNotificationBadge();
  }
}, 300);

function refreshApplications() { 
  debouncedRefreshApplications(false); // Manual refresh - can show loading
}

async function initializeAndRefreshTables() {
  await loadApplications('new', { showLoading: true });
  await updateBadgeCounts();
  await updateUserNotificationBadge();
  
  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(async () => {
    const activeSection = document.querySelector('.content-section.active')?.id;
    if (activeSection && activeSection !== 'new-application') {
      // Auto-refresh - don't show loading overlay
      await loadApplications(activeSection, { 
        showLoading: false,
        isAutoRefresh: true 
      });
      await updateBadgeCounts();
      await updateUserNotificationBadge();
    }
  }, 60000); // Auto-refresh every 60 seconds
}

// ----------- USER MANAGEMENT -----------
async function getAllUsersHandler() {
  try {
    const response = await window.apiService.getAllUsers();
    const users = response.data || [];
    const tbody = document.getElementById('users-list-body');
    
    if (!tbody) return;
    
    if (!users.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="no-data">No users found</td></tr>`;
      return;
    }
    
    tbody.innerHTML = users.map(user => `
      <tr>
        <td>${escapeHtml(user.name)}</td>
        <td>${escapeHtml(user.level)}</td>
        <td>${escapeHtml(user.role)}</td>
        <td class="actions">
          <button class="btn-icon btn-delete" title="Delete" onclick="deleteUser('${escapeHtml(user.name)}')">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Error loading users:', error);
    const tbody = document.getElementById('users-list-body');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="4" class="error">Error loading users</td></tr>`;
    }
  }
}

function refreshUsersList() { 
  getAllUsersHandler(); 
}

async function populateUsersTable() {
  await getAllUsersHandler();
}

document.addEventListener('DOMContentLoaded', function() {
  const addUserForm = document.getElementById('add-user-form');
  if (addUserForm) {
    addUserForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      const name = document.getElementById('new-user-name')?.value.trim();
      const level = document.getElementById('new-user-level')?.value;
      const role = document.getElementById('new-user-role')?.value;
      
      if (!name || !level || !role) {
        alert('Please fill all fields!');
        return;
      }
      
      try {
        const response = await window.apiService.addUser({ name, level, role });
        if (response.success) {
          showSuccessModal(response.message || 'User added!');
          showSection('users-list');
          refreshUsersList();
        } else {
          alert('Error: ' + response.message);
        }
      } catch (error) {
        alert('Error adding user: ' + error.message);
      }
    });
  }
});

async function deleteUser(userName) {
  if (!confirm('Are you sure you want to delete user: ' + userName + '?')) return;
  
  try {
    const response = await window.apiService.deleteUser(userName);
    if (response.success) {
      showSuccessModal(response.message || 'User deleted!');
      refreshUsersList();
    } else {
      alert('Error: ' + response.message);
    }
  } catch (error) {
    alert('Error deleting user: ' + error.message);
  }
}

// ----------- SUCCESS MODAL -----------
function showSuccessModal(message) {
  if (cachedElements['success-message']) cachedElements['success-message'].textContent = message;
  if (cachedElements['success-modal']) cachedElements['success-modal'].style.display = 'flex';
}

function closeSuccessModal() {
  if (cachedElements['success-modal']) cachedElements['success-modal'].style.display = 'none';
}

// ----------- UTILITY FUNCTIONS -----------
function escapeHtml(s) {
  if (!s) return '';
  return s.toString().replace(/[&<>"']/g, function(m){ 
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]; 
  });
}

// ----------- BROWSER NOTIFICATIONS -----------
function initializeBrowserNotifications() {
  if (!("Notification" in window)) return;
  
  switch (Notification.permission) {
    case "granted":
      setupNotificationListener(); 
      break;
    case "denied":
      break;
    case "default":
      Notification.requestPermission().then(permission => {
        if (permission === "granted") setupNotificationListener();
      });
      break;
  }
}

function setupNotificationListener() {
  if (notificationCheckInterval) clearInterval(notificationCheckInterval);
  notificationCheckInterval = setInterval(function() { 
    checkForNewApplications(); 
  }, 30000);
}

async function checkForNewApplications() {
  const userName = localStorage.getItem('loggedInName');
  if (!userName || document.visibilityState === 'visible') return;
  
  try {
    const response = await window.apiService.getApplicationCountsForUser(userName);
    const currentCount = response.count || 0;
    const previousCount = lastAppCount;
    lastAppCount = currentCount;
    
    if (currentCount > previousCount && previousCount > 0) {
      const newCount = currentCount - previousCount;
      const userRole = localStorage.getItem('userRole') || '';
      showApplicationNotification(userName, userRole, newCount);
    }
  } catch (error) {
    console.error('Error checking applications:', error);
  }
}

function showApplicationNotification(userName, userRole, count) {
  if (Notification.permission === "granted" && document.visibilityState !== 'visible') {
    const notification = new Notification("New Application Assignment", {
      body: `${userName} have ${count} application(s) for your action${userRole ? ` as ${userRole}` : ''}`,
      icon: "https://img.icons8.com/color/192/000000/loan.png",
      tag: "loan-application",
      requireInteraction: true
    });
    
    notification.onclick = function() {
      window.focus();
      notification.close();
      refreshApplications();
    };
    
    setTimeout(() => { notification.close(); }, 10000);
  }
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    refreshApplications();
    updateUserNotificationBadge();
  } else {
    const userName = localStorage.getItem('loggedInName');
    if (userName) {
      window.apiService.getApplicationCountsForUser(userName)
        .then(response => {
          lastAppCount = response.count || 0;
        })
        .catch(error => console.error('Error getting app count:', error));
    }
  }
}

async function initializeAppCount() {
  const userName = localStorage.getItem('loggedInName');
  if (userName) {
    try {
      const response = await window.apiService.getApplicationCountsForUser(userName);
      lastAppCount = response.count || 0;
    } catch (error) {
      console.error('Error initializing app count:', error);
    }
  }
}

// ----------- EVENT LISTENERS -----------
document.addEventListener('DOMContentLoaded', function() {
  // Add click handler for Add New Application button
  const addAppBtn = document.querySelector('.add-app-btn');
  if (addAppBtn) {
    // Remove any existing onclick
    addAppBtn.removeAttribute('onclick');
    
    addAppBtn.addEventListener('click', async function(e) {
      e.preventDefault();
      e.stopPropagation();
      
      console.log('Add New Application button clicked');
      
      // Call the modal function directly
      if (typeof showNewApplicationModal === 'function') {
        await showNewApplicationModal();
      }
    });
  }
  
  // Click outside to close modal
  const modal = document.getElementById('newApplicationModal');
  if (modal) {
    modal.addEventListener('click', function(event) {
      if (event.target === this) {
        if (typeof closeNewApplicationModal === 'function') {
          closeNewApplicationModal();
        }
      }
    });
  }
});

// ----------- GLOBAL EXPORTS -----------
window.showSection = showSection;
window.refreshApplications = refreshApplications;
window.refreshUsersList = refreshUsersList;
window.deleteUser = deleteUser;
window.logout = logout;
window.closeSuccessModal = closeSuccessModal;
window.closeViewApplicationModal = closeViewApplicationModal;
window.setLoggedInUser = setLoggedInUser;

