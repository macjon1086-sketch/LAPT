// viewApps.js — View Application modal logic (adapted from viewApplicationJS)
// Exposes helpers used by the main app and handles view/edit flows.

console.log('viewApps.js loaded');

let currentAppData = null;

// status badge helper
function setStatusBadge(statusRaw, stageRaw) {
  const badge = document.getElementById('applicationStatusBadge');
  if (!badge) return;
  const status = (statusRaw || '').toString().trim().toUpperCase();
  const stage = stageRaw || '';
  let text = status || stage || 'NEW';
  let bg = '#eef2ff';
  let color = '#1f2937';

  switch (status) {
    case 'NEW': bg = '#f3f4f6'; color = '#111827'; text = 'NEW'; break;
    case 'PENDING': bg = '#fff7ed'; color = '#92400e'; text = 'PENDING'; break;
    case 'PENDING APPROVAL': bg = '#e6f0ff'; color = '#0546a0'; text = 'PENDING APPROVAL'; break;
    case 'APPROVED': bg = '#ecfdf5'; color = '#065f46'; text = 'APPROVED'; break;
    case 'REVERTED': case 'REVERT': bg = '#ffebef'; color = '#9b1c1c'; text = 'REVERTED'; break;
    default: bg = '#f3f4f6'; color = '#111827'; text = status || stage || 'N/A'; break;
  }

  badge.textContent = text;
  badge.style.background = bg;
  badge.style.color = color;
  badge.style.border = `1px solid ${bg}`;
}

// fetch and show an application (uses server if available)
function viewApplication(appNumber) {
  if (!appNumber) { console.error('No application number provided'); return; }
  if (typeof showLoading === 'function') showLoading();

  if (window.google && google.script && google.script.run) {
    google.script.run
      .withSuccessHandler(function(response) {
        if (typeof hideLoading === 'function') hideLoading();
        initViewApplicationModal(response && response.data ? response.data : response);
      })
      .withFailureHandler(function(error) {
        if (typeof hideLoading === 'function') hideLoading();
        console.error('Error fetching application:', error);
        alert('Failed to load application details.');
      })
      .getApplicationDetails(appNumber);
  } else {
    // Local/demo mode: cannot fetch
    if (typeof hideLoading === 'function') hideLoading();
    alert('Viewing application requires server-side API (Apps Script). Running in demo/local mode.');
  }
}

function initViewApplicationModal(appData) {
  if (!appData) { console.error('No application data provided'); return; }
  currentAppData = appData || {};
  const appNumber = appData.appNumber || 'N/A';
  const applicantName = appData.applicantName || appData.name || 'N/A';

  safeSetText('applicationNumber', appNumber);
  safeSetText('applicationApplicantName', applicantName);
  setStatusBadge(appData.status, appData.stage);

  const printBtn = document.getElementById('btn-print');
  if (printBtn) {
    if ((appData.status || '').toString().trim().toUpperCase() === 'APPROVED') printBtn.style.display = 'inline-block';
    else printBtn.style.display = 'none';
  }

  safeSetText('view-name', applicantName);
  safeSetText('view-amount', formatCurrency(appData.amount));
  safeSetText('view-purpose', appData.purpose || 'N/A');
  safeSetText('view-duration', appData.duration ? `${appData.duration} months` : 'N/A');
  safeSetText('view-interestRate', appData.interestRate ? `${appData.interestRate}%` : 'N/A');

  safeSetText('view-characterComment', appData.characterComment || 'No character assessment provided.');

  populateLoanHistoryReview(appData.loanHistory || []);
  populatePersonalBudgetReview(appData.personalBudget || []);
  populateMonthlyTurnoverReview(appData.monthlyTurnover || {});
  safeSetText('view-netIncome', formatCurrency(appData.netIncome));
  safeSetText('view-debtServiceRatio', appData.debtServiceRatio || 'N/A');

  safeSetText('view-marginComment', appData.marginComment || 'No comment');
  safeSetText('view-repaymentComment', appData.repaymentComment || 'No comment');
  safeSetText('view-securityComment', appData.securityComment || 'No comment');
  safeSetText('view-financialsComment', appData.financialsComment || 'No comment');
  safeSetText('view-risksComment', appData.risksComment || 'No comment');
  safeSetText('view-riskMitigationComment', appData riskMitigationComment || 'No comment'); // fallback if missing

  // display recommendations
  safeSetText('view-details-creditOfficerComment', appData.creditOfficerComment || 'No recommendation');
  safeSetText('view-details-amlroComments', appData.amlroComments || 'No comments');
  safeSetText('view-details-headOfCredit', appData.headOfCredit || 'No recommendation');
  safeSetText('view-details-branchManager', appData.branchManager || 'No recommendation');
  safeSetText('view-details-approver1Comments', appData.approver1Comments || 'No comments');

  // set textareas for editing
  safeSetValue('view-details-creditOfficerComment-textarea', appData.creditOfficerComment || '');
  safeSetValue('view-details-amlroComments-textarea', appData.amlroComments || '');
  safeSetValue('view-details-headOfCredit-textarea', appData.headOfCredit || '');
  safeSetValue('view-details-branchManager-textarea', appData.branchManager || '');
  safeSetValue('view-details-approver1Comments-textarea', appData.approver1Comments || '');

  safeSetText('signature-creditOfficer-name', appData.creditOfficerName || appData.creditOfficer || '');
  safeSetText('signature-headOfCredit-name', appData.headOfCreditName || appData.headOfCredit || '');
  safeSetText('signature-branchManager-name', appData.branchManagerName || appData.branchManager || '');

  updateDocumentButtonsForReview(appData.documents || {});

  const userRole = (localStorage.getItem('userRole') || '').toString();
  showRelevantCommentEditors(userRole, appData.stage || 'New');

  updateModalUIForStage(appData);

  const modal = document.getElementById('viewApplicationModal');
  if (modal) modal.style.display = 'block';
}

function closeViewApplicationModal() {
  const modal = document.getElementById('viewApplicationModal');
  if (modal) modal.style.display = 'none';
  try { document.body.style.overflow = ''; } catch (e) {}
}

function openEditSection(tabName) {
  try {
    if (!currentAppData || !currentAppData.appNumber) { alert('Application not loaded.'); return; }
    closeViewApplicationModal();
    sessionStorage.setItem('editTab', tabName || 'tab1');
    if (typeof showNewApplicationModal === 'function') showNewApplicationModal(currentAppData.appNumber);
    else window.showNewApplicationModal && window.showNewApplicationModal(currentAppData.appNumber);
  } catch (e) {
    console.error('Error opening edit section:', e);
  }
}

function hideAllRoleEditors() {
  document.querySelectorAll('.comment-editor').forEach(el => { el.style.display = 'none'; });
}
function showEditorForRole(roleName) {
  if (!roleName) return;
  const roleLower = roleName.toString().trim().toLowerCase();
  document.querySelectorAll('.comment-editor').forEach(el => {
    const roles = (el.dataset.role || '').split(',').map(r => r.trim().toLowerCase());
    if (roles.includes(roleLower)) el.style.display = 'block';
  });
}
function showRelevantCommentEditors(userRole, stage) {
  hideAllRoleEditors();
  if (!userRole) return;
  const roleLower = userRole.toString().trim().toLowerCase();
  const stageLower = (stage || '').toString().trim().toLowerCase();
  document.querySelectorAll('.comment-editor').forEach(el => {
    const roles = (el.dataset.role || '').split(',').map(r => r.trim().toLowerCase());
    const stages = (el.dataset.stages || '').split(',').map(s => s.trim().toLowerCase());
    const roleMatch = roles.includes(roleLower);
    const stageMatch = stages.length === 0 || stages.some(s => s === stageLower);
    if (roleMatch && stageMatch) el.style.display = 'block';
  });
}

// save stage comment
function saveStageComment(isRevert, explicitAction) {
  if (!currentAppData || !currentAppData.appNumber) { alert('Application data not available.'); return; }
  const appNumber = currentAppData.appNumber;
  const comment = (document.getElementById('stageComment') || {}).value || '';
  const userName = localStorage.getItem('loggedInName') || '';
  const userRole = localStorage.getItem('userRole') || '';

  if (typeof showLoading === 'function') showLoading();

  if (isRevert || explicitAction === 'REVERT') {
    const targetStage = prompt('Enter stage to revert to (New, Assessment, Compliance, Ist Review, 2nd Review):');
    if (!targetStage) { if (typeof hideLoading === 'function') hideLoading(); return; }
    if (window.google && google.script && google.script.run) {
      google.script.run
        .withSuccessHandler(function(response) {
          if (typeof hideLoading === 'function') hideLoading();
          if (response && response.success) { alert(response.message || 'Application reverted successfully'); closeViewApplicationModal(); if (typeof refreshApplications === 'function') refreshApplications(); }
          else { alert('Error: ' + (response && response.message ? response.message : 'Unknown error')); }
        }).withFailureHandler(function(err) { if (typeof hideLoading === 'function') hideLoading(); alert('Error: ' + (err && err.message ? err.message : err)); })
        .revertApplicationStage(appNumber, targetStage, userName);
    } else {
      if (typeof hideLoading === 'function') hideLoading();
      alert('Revert requires server-side implementation.');
    }
    return;
  }

  const action = explicitAction === 'APPROVE' ? 'APPROVE' : 'SUBMIT';

  const commentsData = {
    creditOfficerComment: document.getElementById('view-details-creditOfficerComment-textarea')?.value || '',
    amlroComments: document.getElementById('view-details-amlroComments-textarea')?.value || '',
    headOfCredit: document.getElementById('view-details-headOfCredit-textarea')?.value || '',
    branchManager: document.getElementById('view-details-branchManager-textarea')?.value || '',
    approver1Comments: document.getElementById('view-details-approver1Comments-textarea')?.value || '',
    role: userRole,
    stage: currentAppData.stage || ''
  };

  if (window.google && google.script && google.script.run) {
    google.script.run
      .withSuccessHandler(function(response) {
        if (typeof hideLoading === 'function') hideLoading();
        if (response && response.success) { alert(response.message || 'Action completed successfully'); closeViewApplicationModal(); if (typeof refreshApplications === 'function') refreshApplications(); }
        else { alert('Error: ' + (response && response.message ? response.message : 'Unknown error')); }
      })
      .withFailureHandler(function(err) {
        if (typeof hideLoading === 'function') hideLoading();
        alert('Error: ' + (err && err.message ? err.message : err));
      })
      .submitApplicationComment({
        appNumber: appNumber,
        comment: comment,
        action: action,
        comments: commentsData
      }, userName);
  } else {
    if (typeof hideLoading === 'function') hideLoading();
    alert('Submitting comments requires server-side implementation.');
  }
}

// helper functions used above (kept minimal)
function populateLoanHistoryReview(loanHistory) {
  const tbody = document.querySelector('#view-loanHistoryTable tbody');
  if (!tbody) return;
  if (!loanHistory.length) { tbody.innerHTML = '<tr><td colspan="5" class="no-data">No loan history found</td></tr>'; return; }
  const rows = loanHistory.map(loan => `
    <tr>
      <td>${formatDate(loan.disbursementDate)}</td>
      <td>${escapeHtml(loan.tenure || 'N/A')}</td>
      <td>${formatCurrency(loan.amount)}</td>
      <td>${formatDate(loan.endDate)}</td>
      <td>${escapeHtml(loan.comment || 'N/A')}</td>
    </tr>
  `).join('');
  tbody.innerHTML = rows;
}
function populatePersonalBudgetReview(personalBudget) {
  const tbody = document.querySelector('#view-personalBudgetTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  const groups = { Income: [], Expense: [], Repayment: [] };
  (personalBudget || []).forEach(item => {
    const type = (item.type || '').toString().trim();
    const desc = item.description || item.desc || '';
    const amount = parseFloat(item.amount) || 0;
    if (type.toLowerCase() === 'income') groups.Income.push({ desc, amount });
    else if (type.toLowerCase() === 'repayment') groups.Repayment.push({ desc, amount });
    else groups.Expense.push({ desc, amount });
  });

  function appendGroup(title, items) {
    const header = document.createElement('tr');
    header.innerHTML = `<td colspan="2" style="font-weight:bold; padding-top:8px;">${escapeHtml(title)}</td>`;
    tbody.appendChild(header);
    if (!items.length) {
      const emptyRow = document.createElement('tr');
      emptyRow.innerHTML = `<td colspan="2" class="no-data">No ${escapeHtml(title.toLowerCase())} items</td>`;
      tbody.appendChild(emptyRow);
      return;
    }
    items.forEach(it => {
      const r = document.createElement('tr');
      r.innerHTML = `<td>${escapeHtml(it.desc)}</td><td>${formatCurrency(it.amount)}</td>`;
      tbody.appendChild(r);
    });
  }

  appendGroup('INCOME', groups.Income);
  appendGroup('EXPENDITURE', groups.Expense);
  appendGroup('REPAYMENT', groups.Repayment);

  let netIncomeVal = null;
  if (currentAppData && currentAppData.netIncome !== undefined && currentAppData.netIncome !== null) netIncomeVal = currentAppData.netIncome;
  else {
    const totalIncome = groups.Income.reduce((s,i) => s + (i.amount || 0), 0);
    const totalExpense = groups.Expense.reduce((s,i) => s + (i.amount || 0), 0);
    netIncomeVal = totalIncome - totalExpense;
  }
  const netRow = document.createElement('tr');
  netRow.innerHTML = `<td style="text-align:right; font-weight:bold;">NET INCOME</td><td style="font-weight:bold;">${formatCurrency(netIncomeVal)}</td>`;
  tbody.appendChild(netRow);

  let dsrVal = null;
  if (currentAppData && currentAppData.debtServiceRatio !== undefined && currentAppData.debtServiceRatio !== null) dsrVal = currentAppData.debtServiceRatio;
  else {
    const totalRepayments = groups.Repayment.reduce((s,i) => s + (i.amount || 0), 0);
    if (netIncomeVal > 0) dsrVal = ((totalRepayments / netIncomeVal) * 100).toFixed(2) + '%';
    else if (totalRepayments > 0) dsrVal = 'N/A';
    else dsrVal = '0.00%';
  }
  const dsrRow = document.createElement('tr');
  dsrRow.innerHTML = `<td style="text-align:right; font-weight:bold;">Debt Service Ratio:</td><td style="font-weight:bold;">${escapeHtml(dsrVal.toString())}</td>`;
  tbody.appendChild(dsrRow);

  safeSetText('view-netIncome', formatCurrency(netIncomeVal));
  safeSetText('view-debtServiceRatio', dsrVal);
}
function populateMonthlyTurnoverReview(turnover) {
  const tbody = document.querySelector('#view-monthlyTurnoverTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  const months = ['month1','month2','month3'];
  let hasData = false;
  let totalCr=0,totalDr=0,totalMax=0,totalMin=0,countedMonths=0;
  months.forEach((m,i) => {
    const n = i+1;
    const monthVal = turnover[m] || '';
    const cr = parseFloat(turnover[`crTO${n}`]) || 0;
    const dr = parseFloat(turnover[`drTO${n}`]) || 0;
    const maxB = parseFloat(turnover[`maxBal${n}`]) || 0;
    const minB = parseFloat(turnover[`minBal${n}`]) || 0;
    if (monthVal || cr || dr || maxB || minB) hasData = true;
    const row = document.createElement('tr');
    row.innerHTML = `<td>${escapeHtml(monthVal || ('Month ' + n))}</td><td>${formatCurrency(cr)}</td><td>${formatCurrency(dr)}</td><td>${formatCurrency(maxB)}</td><td>${formatCurrency(minB)}</td>`;
    tbody.appendChild(row);
    totalCr += cr; totalDr += dr; totalMax += maxB; totalMin += minB; countedMonths++;
  });
  if (!hasData) { tbody.innerHTML = '<tr><td colspan="5" class="no-data">No turnover data found</td></tr>'; return; }
  function appendCalcRow(label, crVal, drVal, maxVal, minVal) { const r = document.createElement('tr'); r.className='calculation-row'; r.innerHTML = `<td>${label}</td><td>${formatCurrency(crVal)}</td><td>${formatCurrency(drVal)}</td><td>${formatCurrency(maxVal)}</td><td>${formatCurrency(minVal)}</td>`; tbody.appendChild(r); }
  appendCalcRow('<strong>Total</strong>', totalCr, totalDr, totalMax, totalMin);
  const monthsForAvg = countedMonths > 0 ? countedMonths : 3;
  appendCalcRow('<strong>Monthly Average</strong>', totalCr / monthsForAvg, totalDr / monthsForAvg, totalMax / monthsForAvg, totalMin / monthsForAvg);
  appendCalcRow('<strong>Weekly Average</strong>', totalCr / (monthsForAvg * 4), totalDr / (monthsForAvg * 4), totalMax / (monthsForAvg * 4), totalMin / (monthsForAvg * 4));
  appendCalcRow('<strong>Daily Average</strong>', totalCr / (monthsForAvg * 30), totalDr / (monthsForAvg * 30), totalMax / (monthsForAvg * 30), totalMin / (monthsForAvg * 30));
}

function updateDocumentButtonsForReview(documents) {
  const docTypes = ['bankStatement','payslip','letterOfUndertaking','loanStatement'];
  docTypes.forEach(docType => {
    const button = document.getElementById(`view-button-${docType}`);
    const statusEl = document.getElementById(`view-doc-${docType}-status`);
    if (!button) return;
    const docUrl = documents[docType];
    if (docUrl && docUrl.trim() !== '') {
      button.disabled = false; button.textContent = 'View'; button.style.cursor = 'pointer'; button.style.opacity = '1'; button.onclick = function(){ window.open(docUrl, '_blank'); };
      if (statusEl) { statusEl.textContent = 'Uploaded'; statusEl.classList.add('uploaded'); }
    } else {
      button.disabled = true; button.textContent = 'Not Uploaded'; button.style.cursor = 'not-allowed'; button.style.opacity = '0.6'; button.onclick = null;
      if (statusEl) { statusEl.textContent = 'Not Uploaded'; statusEl.classList.remove('uploaded'); }
    }
  });
}
function openDocument(docType) {
  if (!currentAppData || !currentAppData.documents) { alert('Document data not available'); return; }
  const docUrl = currentAppData.documents[docType];
  if (docUrl && docUrl.trim() !== '') window.open(docUrl, '_blank'); else alert('Document not found or URL not available');
}

// UI state logic
function updateModalUIForStage(appData) {
  const stage = (appData.stage || 'New').toString().trim();
  const status = (appData.status || '').toString().trim().toUpperCase();
  const userRoleRaw = (localStorage.getItem('userRole') || '').toString().trim();
  const role = userRoleRaw.toLowerCase();

  const signatureSection = document.getElementById('signatures-section');
  const approveBtn = document.getElementById('btn-approve');
  const revertBtn = document.getElementById('btn-revert');
  const submitBtn = document.getElementById('btn-submit');

  if (signatureSection) { if (status === 'APPROVED' || stage === 'Approval') signatureSection.style.display = 'block'; else signatureSection.style.display = 'none'; }
  if (approveBtn) approveBtn.style.display = 'none';
  if (revertBtn) revertBtn.style.display = 'none';
  if (submitBtn) submitBtn.style.display = 'none';
  hideAllRoleEditors();

  const isAdmin = role === 'admin';
  const isCreditOfficer = role.includes('credit officer') || role.includes('credit sales officer') || role.includes('credit analyst');
  const isAMLRO = role === 'amlro' || role.includes('amlro');
  const isHeadOfCredit = role.includes('head of credit');
  const isBranchManager = role.includes('branch manager') || role.includes('branch manager/approver');
  const isApprover = role === 'approver' || role.includes('approver');

  switch (status) {
    case 'NEW':
    case '':
      if (isCreditOfficer || isAdmin) { showEditorForRole('Credit Officer'); if (submitBtn) submitBtn.style.display = 'inline-block'; }
      break;
    case 'PENDING':
      if (isAMLRO || isAdmin) { showEditorForRole('AMLRO'); if (submitBtn) submitBtn.style.display = 'inline-block'; }
      if (isHeadOfCredit || isAdmin) { showEditorForRole('Head of Credit'); if (submitBtn) submitBtn.style.display = 'inline-block'; }
      if (isBranchManager || isAdmin) { showEditorForRole('Branch Manager/Approver'); if (submitBtn) submitBtn.style.display = 'inline-block'; if (approveBtn) approveBtn.style.display = 'inline-block'; if (revertBtn) revertBtn.style.display = 'inline-block'; }
      break;
    case 'PENDING APPROVAL':
      if (isApprover || isAdmin) { showEditorForRole('Approver'); if (approveBtn) approveBtn.style.display = 'inline-block'; if (revertBtn) revertBtn.style.display = 'inline-block'; }
      break;
    case 'APPROVED':
      // no action buttons
      break;
    default:
      break;
  }

  const anyEditorVisible = Array.from(document.querySelectorAll('.comment-editor')).some(el => el.style.display !== 'none');
  if (anyEditorVisible) {
    const commentSection = document.getElementById('stage-comment-section');
    const commentLabel = document.getElementById('stage-comment-label');
    if (commentSection) commentSection.style.display = 'block';
    if (commentLabel) { commentLabel.style.display = 'block'; commentLabel.textContent = 'Comment'; }
  }
}

// helpers
function safeSetText(id, value) { const el = document.getElementById(id); if (!el) return; if (value === null || value === undefined) { el.textContent = ''; return; } el.textContent = value.toString().replace(/\r\n/g, '\n'); }
function safeSetValue(id, value) { const el = document.getElementById(id); if (el) el.value = value; }
function formatCurrency(value) { if (value === null || value === undefined) return '0.00'; const num = parseFloat(value); return isNaN(num) ? '0.00' : num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function formatDate(dateString) { if (!dateString) return 'N/A'; const d = new Date(dateString); if (isNaN(d)) return dateString; return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
function escapeHtml(s) { if (!s) return ''; return s.toString().replace(/[&<>"']/g, function(m){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m]; }); }

window.initViewApplicationModal = initViewApplicationModal;
window.closeViewApplicationModal = closeViewApplicationModal;
window.viewApplication = viewApplication;
window.openDocument = openDocument;
window.saveStageComment = saveStageComment;
window.printApplicationDetails = function(){ window.print(); };
