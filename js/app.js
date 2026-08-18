/**
 * Franchise Exception Monitor - Main Application Controller
 */

import { evaluateFranchiseNetwork, DEFAULT_CONFIG, formatCurrency, daysBetween } from './engine.js';
import { loadLocations, exportExceptionsToCSV, downloadFile, EXACT_DATASET_CSV } from './data.js';

// Application State
const state = {
  rawLocations: [],
  evaluatedData: null,
  activeFilter: 'all_flagged', // 'all_flagged', 'MISSING_LATE', 'SALES_ANOMALY', 'EXPENSE_ANOMALY', 'CHRONIC_LATE', 'all_network'
  priorityFilter: 'all',        // 'all', 'High', 'Medium', 'Clean'
  searchQuery: '',
  sortColumn: 'rank',
  sortDirection: 'asc',
  selectedLocation: null,
  resolvedLocations: new Set(),
  config: { ...DEFAULT_CONFIG }
};

// DOM Elements
const elements = {
  // KPI values
  kpiTotalVal: document.getElementById('kpi-total-val'),
  kpiFlaggedVal: document.getElementById('kpi-flagged-val'),
  kpiFlaggedPct: document.getElementById('kpi-flagged-pct'),
  kpiHighVal: document.getElementById('kpi-high-val'),
  kpiRiskVal: document.getElementById('kpi-risk-val'),
  kpiPassVal: document.getElementById('kpi-pass-val'),

  // Rule counts in summary ribbon
  countRuleMissing: document.getElementById('count-rule-missing'),
  countRuleSales: document.getElementById('count-rule-sales'),
  countRuleExpense: document.getElementById('count-rule-expense'),
  countRuleChronic: document.getElementById('count-rule-chronic'),

  // Chip counts
  chipCountFlagged: document.getElementById('chip-count-flagged'),
  chipCountMissing: document.getElementById('chip-count-missing'),
  chipCountSales: document.getElementById('chip-count-sales'),
  chipCountExpense: document.getElementById('chip-count-expense'),
  chipCountChronic: document.getElementById('chip-count-chronic'),
  chipCountAll: document.getElementById('chip-count-all'),

  // Filters & Search
  filterChips: document.querySelectorAll('.filter-chip'),
  priorityFilter: document.getElementById('priority-filter'),
  searchInput: document.getElementById('search-input'),
  searchClear: document.getElementById('search-clear'),

  // Table
  tableBody: document.getElementById('table-body'),
  tableEmpty: document.getElementById('table-empty'),
  tableShowingCount: document.getElementById('table-showing-count'),
  tableDisplayLabel: document.getElementById('table-display-label'),
  tableHeaders: document.querySelectorAll('.compliance-table thead th'),
  btnResetFilters: document.getElementById('btn-reset-filters'),

  // Drawer
  drawer: document.getElementById('drawer-inspect'),
  drawerOverlay: document.getElementById('drawer-overlay'),
  drawerClose: document.getElementById('drawer-close'),
  drawerLocId: document.getElementById('drawer-loc-id'),
  drawerLocName: document.getElementById('drawer-loc-name'),
  drawerTags: document.getElementById('drawer-tags'),
  drawerBodyContent: document.getElementById('drawer-body-content'),
  btnActionNotice: document.getElementById('btn-action-notice'),
  btnActionAudit: document.getElementById('btn-action-audit'),
  btnActionResolve: document.getElementById('btn-action-resolve'),

  // Rule Config Modal
  modalRules: document.getElementById('modal-rules'),
  modalRulesOverlay: document.getElementById('modal-rules-overlay'),
  modalRulesClose: document.getElementById('modal-rules-close'),
  btnRuleConfig: document.getElementById('btn-rule-config'),
  cfgGraceDays: document.getElementById('cfg-grace-days'),
  cfgSalesDrop: document.getElementById('cfg-sales-drop'),
  cfgExpenseMult: document.getElementById('cfg-expense-mult'),
  cfgChronicLate: document.getElementById('cfg-chronic-late'),
  btnApplyRules: document.getElementById('btn-apply-rules'),
  btnResetRules: document.getElementById('btn-reset-rules'),

  // Raw Data Modal
  modalRawData: document.getElementById('modal-raw-data'),
  modalRawOverlay: document.getElementById('modal-raw-overlay'),
  modalRawClose: document.getElementById('modal-raw-close'),
  btnViewRawData: document.getElementById('btn-view-raw-data'),
  rawCsvContent: document.getElementById('raw-csv-content'),
  btnCopyCsv: document.getElementById('btn-copy-csv'),

  // Export
  btnExportCsv: document.getElementById('btn-export-csv'),

  // Toast
  toastContainer: document.getElementById('toast-container')
};

/**
 * Show a toast notification
 */
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${message}</span>
  `;
  elements.toastContainer.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

/**
 * Re-evaluate rules against dataset
 */
function runRuleEngine() {
  state.evaluatedData = evaluateFranchiseNetwork(state.rawLocations, state.config);
  
  // Adjust for manually resolved items in this session
  if (state.resolvedLocations.size > 0) {
    state.evaluatedData.locations.forEach(loc => {
      if (state.resolvedLocations.has(loc.location_id)) {
        loc.isFlagged = false;
        loc.priority = 'Clean';
        loc.exceptionType = 'Resolved';
        loc.reason = 'Marked as resolved by compliance officer.';
      }
    });
  }

  updateKPICards();
  renderTable();
}

/**
 * Update Top KPI summary cards and filter counters
 */
function updateKPICards() {
  const { kpis } = state.evaluatedData;

  elements.kpiTotalVal.textContent = kpis.totalLocations;
  elements.kpiFlaggedVal.textContent = kpis.flaggedCount;
  elements.kpiFlaggedPct.textContent = `${kpis.flaggedPercentage}% Rate`;
  elements.kpiHighVal.textContent = kpis.highPriorityCount;
  elements.kpiRiskVal.textContent = `$${kpis.totalSalesDeficit.toLocaleString()}`;
  elements.kpiPassVal.textContent = `${kpis.cleanPercentage}%`;

  // Rule summary ribbon counts
  elements.countRuleMissing.textContent = kpis.ruleCounts.missingLate;
  elements.countRuleSales.textContent = kpis.ruleCounts.salesAnomaly;
  elements.countRuleExpense.textContent = kpis.ruleCounts.expenseAnomaly;
  elements.countRuleChronic.textContent = kpis.ruleCounts.chronicLate;

  // Filter chip badge counts
  elements.chipCountFlagged.textContent = kpis.flaggedCount;
  elements.chipCountMissing.textContent = kpis.ruleCounts.missingLate;
  elements.chipCountSales.textContent = kpis.ruleCounts.salesAnomaly;
  elements.chipCountExpense.textContent = kpis.ruleCounts.expenseAnomaly;
  elements.chipCountChronic.textContent = kpis.ruleCounts.chronicLate;
  elements.chipCountAll.textContent = kpis.totalLocations;
}

/**
 * Filter and sort locations based on current state
 */
function getVisibleLocations() {
  let list = [];

  if (state.activeFilter === 'all_flagged') {
    list = state.evaluatedData.locations.filter(loc => loc.isFlagged);
  } else if (state.activeFilter === 'all_network') {
    list = [...state.evaluatedData.locations];
  } else {
    // Specific rule filter
    list = state.evaluatedData.locations.filter(loc => 
      loc.exceptions && loc.exceptions.some(e => e.ruleId === state.activeFilter)
    );
  }

  // Priority filter
  if (state.priorityFilter !== 'all') {
    list = list.filter(loc => loc.priority === state.priorityFilter);
  }

  // Search Query filter
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    list = list.filter(loc => 
      (loc.location_name && loc.location_name.toLowerCase().includes(q)) ||
      (loc.location_id && loc.location_id.toLowerCase().includes(q)) ||
      (loc.format && loc.format.toLowerCase().includes(q)) ||
      (loc.reason && loc.reason.toLowerCase().includes(q))
    );
  }

  // Sorting
  const dir = state.sortDirection === 'asc' ? 1 : -1;
  list.sort((a, b) => {
    if (state.sortColumn === 'rank') {
      const rA = typeof a.rank === 'number' ? a.rank : 999;
      const rB = typeof b.rank === 'number' ? b.rank : 999;
      return (rA - rB) * dir;
    }
    if (state.sortColumn === 'location') {
      return (a.location_name || '').localeCompare(b.location_name || '') * dir;
    }
    if (state.sortColumn === 'format') {
      return (a.format || '').localeCompare(b.format || '') * dir;
    }
    if (state.sortColumn === 'type') {
      return (a.exceptionType || '').localeCompare(b.exceptionType || '') * dir;
    }
    if (state.sortColumn === 'priority') {
      const weights = { 'High': 3, 'Medium': 2, 'Low': 1, 'Clean': 0 };
      const wA = weights[a.priority] || 0;
      const wB = weights[b.priority] || 0;
      return (wB - wA) * dir;
    }
    return 0;
  });

  return list;
}

/**
 * Render the ranked exceptions table
 */
function renderTable() {
  const visible = getVisibleLocations();
  const totalInNetwork = state.evaluatedData.locations.length;

  elements.tableShowingCount.textContent = `Showing ${visible.length} of ${totalInNetwork} locations`;

  if (state.activeFilter === 'all_network') {
    elements.tableDisplayLabel.textContent = 'Full Franchise Network Roster (Clean + Flagged)';
  } else if (state.activeFilter === 'all_flagged') {
    elements.tableDisplayLabel.textContent = 'Ranked Compliance Exceptions (Priority Order)';
  } else {
    const labels = {
      'MISSING_LATE': 'Locations with Missing or Late Reports',
      'SALES_ANOMALY': 'Locations with Gross Sales Drop Anomalies (>30%)',
      'EXPENSE_ANOMALY': 'Locations with Expense Spikes (>2x Avg)',
      'CHRONIC_LATE': 'Locations with Chronic Delinquency (3+ Late Filings)'
    };
    elements.tableDisplayLabel.textContent = labels[state.activeFilter] || 'Filtered Compliance Exceptions';
  }

  if (visible.length === 0) {
    elements.tableBody.innerHTML = '';
    elements.tableEmpty.classList.remove('hidden');
    return;
  }

  elements.tableEmpty.classList.add('hidden');

  const rowsHtml = visible.map(loc => {
    const isClean = !loc.isFlagged;
    const priorityClass = isClean ? 'row-clean' : (loc.priority === 'High' ? 'row-high-priority' : 'row-medium-priority');
    
    // Rank badge styling
    let rankBadgeClass = 'rank-badge';
    if (loc.rank === 1) rankBadgeClass += ' rank-1';
    else if (loc.rank === 2 || loc.rank === 3) rankBadgeClass += ' rank-2';
    else if (isClean) rankBadgeClass += ' rank-clean';

    // Exception Badge styling
    let badgeClass = 'exception-badge ';
    if (isClean) {
      badgeClass += 'badge-compliant';
    } else if (loc.exceptions && loc.exceptions.some(e => e.ruleId === 'MISSING_LATE')) {
      badgeClass += 'badge-missing';
    } else if (loc.exceptions && loc.exceptions.some(e => e.ruleId === 'SALES_ANOMALY')) {
      badgeClass += 'badge-sales';
    } else if (loc.exceptions && loc.exceptions.some(e => e.ruleId === 'EXPENSE_ANOMALY')) {
      badgeClass += 'badge-expense';
    } else if (loc.exceptions && loc.exceptions.some(e => e.ruleId === 'CHRONIC_LATE')) {
      badgeClass += 'badge-chronic';
    }

    // Priority pill styling
    let pillClass = 'priority-pill ';
    if (loc.priority === 'High') pillClass += 'priority-high';
    else if (loc.priority === 'Medium') pillClass += 'priority-medium';
    else if (loc.priority === 'Low') pillClass += 'priority-low';
    else pillClass += 'priority-clean';

    return `
      <tr class="${priorityClass}" data-id="${loc.location_id}">
        <td class="col-rank">
          <div class="${rankBadgeClass}">${loc.rank !== undefined ? loc.rank : '—'}</div>
        </td>
        <td class="col-loc">
          <div class="loc-name">${loc.location_name}</div>
          <div class="loc-meta">
            <span class="loc-id">${loc.location_id}</span>
            <span>Expected: ${loc.expected_date || 'N/A'}</span>
          </div>
        </td>
        <td class="col-format">
          <span class="format-tag">${loc.format || 'Standard'}</span>
        </td>
        <td class="col-type">
          <span class="${badgeClass}">
            ${isClean ? '✓ In Compliance' : loc.exceptionType}
          </span>
        </td>
        <td class="col-reason">
          <div class="reason-text">${formatReasonText(loc.reason)}</div>
        </td>
        <td class="col-priority">
          <span class="${pillClass}">
            ${loc.priority}
          </span>
        </td>
        <td class="col-actions text-right">
          <button class="btn-inspect" data-id="${loc.location_id}">
            Inspect &rarr;
          </button>
        </td>
      </tr>
    `;
  }).join('');

  elements.tableBody.innerHTML = rowsHtml;

  // Add click listeners to rows and inspect buttons
  elements.tableBody.querySelectorAll('tr').forEach(row => {
    row.addEventListener('click', (e) => {
      const locId = row.getAttribute('data-id');
      openDrawer(locId);
    });
  });
}

/**
 * Highlight metrics inside the reason text
 */
function formatReasonText(reason) {
  if (!reason) return '—';
  // Highlight numbers, percentages, and dollar amounts
  return reason
    .replace(/(\$\d+[\d,]*)/g, '<span class="reason-metric">$1</span>')
    .replace(/(\d+(\.\d+)?%)/g, '<span class="reason-metric">$1</span>')
    .replace(/(\d+(\.\d+)?x)/g, '<span class="reason-metric">$1</span>');
}

/**
 * Open forensic inspection drawer for a location
 */
function openDrawer(locId) {
  const loc = state.evaluatedData.locations.find(l => l.location_id === locId);
  if (!loc) return;
  state.selectedLocation = loc;

  elements.drawerLocId.textContent = loc.location_id;
  elements.drawerLocName.textContent = loc.location_name;

  // Header tags
  const priorityClass = loc.priority === 'High' ? 'red' : (loc.priority === 'Medium' ? 'amber' : 'emerald');
  elements.drawerTags.innerHTML = `
    <span class="format-tag">${loc.format}</span>
    <span class="kpi-tag ${priorityClass}">${loc.priority} Priority</span>
    ${loc.rank !== '—' ? `<span class="kpi-tag neutral">Rank #${loc.rank}</span>` : ''}
  `;

  // Build drawer body content
  let bodyHtml = '';

  // 1. Primary Exception Summary
  if (loc.isFlagged) {
    bodyHtml += `
      <div class="drawer-card danger">
        <div class="drawer-section-title" style="color: var(--status-red-text); margin-bottom: 6px;">
          Active Exception Triggered
        </div>
        <p style="font-size: 13.5px; font-weight: 500; color: #fff; line-height: 1.4;">
          ${loc.reason}
        </p>
      </div>
    `;
  } else {
    bodyHtml += `
      <div class="drawer-card clean">
        <div class="drawer-section-title" style="color: var(--status-emerald-text); margin-bottom: 6px;">
          Compliance Status: Verified Pass
        </div>
        <p style="font-size: 13px; color: var(--text-muted);">
          All submitted operational and financial metrics are within normal variance thresholds.
        </p>
      </div>
    `;
  }

  // 2. Financial Diagnostics (Gross Sales vs Benchmark)
  const salesDropPct = loc.gross_sales && loc.trailing_avg_sales 
    ? (((loc.trailing_avg_sales - loc.gross_sales) / loc.trailing_avg_sales) * 100).toFixed(1)
    : null;

  const salesVarianceColor = salesDropPct > 30 ? 'red' : (salesDropPct > 0 ? 'amber' : 'emerald');
  const salesBarPct = loc.trailing_avg_sales > 0 && loc.gross_sales
    ? Math.min(100, Math.round((loc.gross_sales / loc.trailing_avg_sales) * 100))
    : (loc.gross_sales ? 100 : 0);

  bodyHtml += `
    <div>
      <div class="drawer-section-title">Sales & Royalty Performance</div>
      <div class="drawer-card">
        <div class="diagnostic-item">
          <span class="diagnostic-label">Current Cycle Gross Sales:</span>
          <span class="diagnostic-val ${loc.gross_sales === null ? 'text-danger' : ''}">
            ${loc.gross_sales !== null ? formatCurrency(loc.gross_sales) : 'MISSING (Unreported)'}
          </span>
        </div>
        <div class="diagnostic-item">
          <span class="diagnostic-label">Trailing 8-Week Avg Baseline:</span>
          <span class="diagnostic-val">${formatCurrency(loc.trailing_avg_sales)}</span>
        </div>
        <div class="diagnostic-item">
          <span class="diagnostic-label">Variance to Baseline:</span>
          <span class="diagnostic-val" style="color: ${salesDropPct > 30 ? 'var(--status-red)' : 'var(--text-heading)'}">
            ${loc.gross_sales === null ? '100% Unreported Volume' : (salesDropPct ? `-${salesDropPct}%` : 'At Benchmark')}
          </span>
        </div>

        <div class="variance-bar-wrap">
          <div class="bar-labels">
            <span>Sales vs Trailing Avg</span>
            <span>${salesBarPct}% of Baseline</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill ${salesVarianceColor}" style="width: ${salesBarPct}%;"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  // 3. Operating Expense Analysis
  const expenseRatio = loc.expense_amount && loc.trailing_avg_expense
    ? (loc.expense_amount / loc.trailing_avg_expense).toFixed(1)
    : null;
  const expenseBarPct = expenseRatio ? Math.min(100, Math.round((expenseRatio / 2.5) * 100)) : 0;
  const expenseColor = expenseRatio >= 2.0 ? 'amber' : 'emerald';

  bodyHtml += `
    <div>
      <div class="drawer-section-title">Operating Expense Breakdown</div>
      <div class="drawer-card">
        <div class="diagnostic-item">
          <span class="diagnostic-label">Tracked Expense Category:</span>
          <span class="diagnostic-val">${loc.expense_category || 'N/A'}</span>
        </div>
        <div class="diagnostic-item">
          <span class="diagnostic-label">Reported Expense Amount:</span>
          <span class="diagnostic-val">${formatCurrency(loc.expense_amount)}</span>
        </div>
        <div class="diagnostic-item">
          <span class="diagnostic-label">Category Benchmark (Trailing Avg):</span>
          <span class="diagnostic-val">${formatCurrency(loc.trailing_avg_expense)}</span>
        </div>
        <div class="diagnostic-item">
          <span class="diagnostic-label">Expense Multiple:</span>
          <span class="diagnostic-val" style="color: ${expenseRatio >= 2.0 ? 'var(--status-amber)' : 'var(--text-heading)'}">
            ${expenseRatio ? `${expenseRatio}x norm` : 'N/A'}
          </span>
        </div>

        <div class="variance-bar-wrap">
          <div class="bar-labels">
            <span>Spike Ratio vs Norm (Max 2.5x)</span>
            <span>${expenseRatio ? `${expenseRatio}x` : '—'}</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill ${expenseColor}" style="width: ${expenseBarPct}%;"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  // 4. Submission & Compliance Timeline
  const lateCount = Number(loc.late_reports_last_6_cycles || 0);
  const isMissingNow = !loc.report_date;

  bodyHtml += `
    <div>
      <div class="drawer-section-title">Filing History & Compliance Cycle (Last 6 Cycles)</div>
      <div class="drawer-card">
        <div class="diagnostic-item">
          <span class="diagnostic-label">Current Cycle Submission:</span>
          <span class="diagnostic-val">
            ${isMissingNow ? 'MISSING / Overdue' : `Received on ${loc.report_date}`}
          </span>
        </div>
        <div class="diagnostic-item">
          <span class="diagnostic-label">Past Delinquency Rate:</span>
          <span class="diagnostic-val" style="color: ${lateCount >= 3 ? 'var(--status-amber)' : 'var(--text-heading)'}">
            ${lateCount} of 6 Cycles Late
          </span>
        </div>

        <div class="history-grid">
          ${renderHistoryCycles(lateCount, isMissingNow)}
        </div>
      </div>
    </div>
  `;

  elements.drawerBodyContent.innerHTML = bodyHtml;
  elements.drawer.classList.add('open');
  elements.drawer.setAttribute('aria-hidden', 'false');
}

/**
 * Generate 6 historical cycle visual chips
 */
function renderHistoryCycles(lateCount, isCurrentMissing) {
  const cycles = ['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug (Cur)'];
  let lateAssigned = lateCount;

  return cycles.map((cName, idx) => {
    let statusText = 'On-Time';
    let statusClass = 'on-time';

    if (idx === 5) {
      // Current cycle
      if (isCurrentMissing) {
        statusText = 'Missing';
        statusClass = 'missing';
      }
    } else {
      // Past cycles: distribute late tags based on lateCount
      if (lateAssigned > 0 && (idx % 2 === 0 || lateAssigned >= 3)) {
        statusText = 'Late';
        statusClass = 'late';
        lateAssigned--;
      }
    }

    return `
      <div class="history-cycle-box">
        <div class="history-cycle-label">${cName}</div>
        <div class="history-cycle-status ${statusClass}">${statusText}</div>
      </div>
    `;
  }).join('');
}

/**
 * Close drawer
 */
function closeDrawer() {
  elements.drawer.classList.remove('open');
  elements.drawer.setAttribute('aria-hidden', 'true');
  state.selectedLocation = null;
}

/**
 * Setup all Event Listeners
 */
function setupEventListeners() {
  // Filter chips click
  elements.filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      elements.filterChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.activeFilter = chip.getAttribute('data-filter');
      renderTable();
    });
  });

  // Priority filter select
  elements.priorityFilter.addEventListener('change', (e) => {
    state.priorityFilter = e.target.value;
    renderTable();
  });

  // Search input
  elements.searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.trim();
    if (state.searchQuery) {
      elements.searchClear.classList.remove('hidden');
    } else {
      elements.searchClear.classList.add('hidden');
    }
    renderTable();
  });

  // Search clear
  elements.searchClear.addEventListener('click', () => {
    elements.searchInput.value = '';
    state.searchQuery = '';
    elements.searchClear.classList.add('hidden');
    renderTable();
  });

  // Reset all filters button (in empty state)
  elements.btnResetFilters.addEventListener('click', () => {
    state.activeFilter = 'all_flagged';
    state.priorityFilter = 'all';
    state.searchQuery = '';
    elements.searchInput.value = '';
    elements.searchClear.classList.add('hidden');
    elements.priorityFilter.value = 'all';
    elements.filterChips.forEach(c => c.classList.remove('active'));
    document.querySelector('.filter-chip[data-filter="all_flagged"]').classList.add('active');
    renderTable();
  });

  // Table header sorting
  elements.tableHeaders.forEach(th => {
    th.addEventListener('click', () => {
      const sortKey = th.getAttribute('data-sort');
      if (!sortKey) return;

      if (state.sortColumn === sortKey) {
        state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortColumn = sortKey;
        state.sortDirection = 'asc';
      }

      // Update header styles
      elements.tableHeaders.forEach(h => h.classList.remove('sorted'));
      th.classList.add('sorted');

      renderTable();
    });
  });

  // Drawer Close
  elements.drawerClose.addEventListener('click', closeDrawer);
  elements.drawerOverlay.addEventListener('click', closeDrawer);

  // Drawer Actions
  elements.btnActionNotice.addEventListener('click', () => {
    if (!state.selectedLocation) return;
    showToast(`Compliance notice & audit notification queued for ${state.selectedLocation.location_name} (${state.selectedLocation.location_id})`, 'info');
  });

  elements.btnActionAudit.addEventListener('click', () => {
    if (!state.selectedLocation) return;
    showToast(`Formal corporate audit ticket opened for ${state.selectedLocation.location_name}`, 'info');
  });

  elements.btnActionResolve.addEventListener('click', () => {
    if (!state.selectedLocation) return;
    const locId = state.selectedLocation.location_id;
    state.resolvedLocations.add(locId);
    showToast(`Exception for ${state.selectedLocation.location_name} marked as RESOLVED.`, 'success');
    closeDrawer();
    runRuleEngine();
  });

  // Rule Config Modal
  elements.btnRuleConfig.addEventListener('click', () => {
    elements.cfgGraceDays.value = state.config.gracePeriodDays;
    elements.cfgSalesDrop.value = Math.round(state.config.salesAnomalyDropPct * 100);
    elements.cfgExpenseMult.value = state.config.expenseAnomalyMultiplier;
    elements.cfgChronicLate.value = state.config.chronicLateCountThreshold;

    elements.modalRules.classList.add('open');
    elements.modalRules.setAttribute('aria-hidden', 'false');
  });

  const closeRuleModal = () => {
    elements.modalRules.classList.remove('open');
    elements.modalRules.setAttribute('aria-hidden', 'true');
  };

  elements.modalRulesClose.addEventListener('click', closeRuleModal);
  elements.modalRulesOverlay.addEventListener('click', closeRuleModal);

  elements.btnApplyRules.addEventListener('click', () => {
    state.config.gracePeriodDays = Number(elements.cfgGraceDays.value) || 2;
    state.config.salesAnomalyDropPct = (Number(elements.cfgSalesDrop.value) || 30) / 100;
    state.config.expenseAnomalyMultiplier = Number(elements.cfgExpenseMult.value) || 2.0;
    state.config.chronicLateCountThreshold = Number(elements.cfgChronicLate.value) || 3;

    closeRuleModal();
    runRuleEngine();
    showToast('Rule engine thresholds updated. Re-evaluated 20 locations.', 'success');
  });

  elements.btnResetRules.addEventListener('click', () => {
    state.config = { ...DEFAULT_CONFIG };
    elements.cfgGraceDays.value = DEFAULT_CONFIG.gracePeriodDays;
    elements.cfgSalesDrop.value = Math.round(DEFAULT_CONFIG.salesAnomalyDropPct * 100);
    elements.cfgExpenseMult.value = DEFAULT_CONFIG.expenseAnomalyMultiplier;
    elements.cfgChronicLate.value = DEFAULT_CONFIG.chronicLateCountThreshold;
    
    closeRuleModal();
    runRuleEngine();
    showToast('Reset compliance rules to system defaults.', 'info');
  });

  // Raw Data Modal
  elements.btnViewRawData.addEventListener('click', () => {
    elements.rawCsvContent.textContent = EXACT_DATASET_CSV;
    elements.modalRawData.classList.add('open');
    elements.modalRawData.setAttribute('aria-hidden', 'false');
  });

  const closeRawModal = () => {
    elements.modalRawData.classList.remove('open');
    elements.modalRawData.setAttribute('aria-hidden', 'true');
  };

  elements.modalRawClose.addEventListener('click', closeRawModal);
  elements.modalRawOverlay.addEventListener('click', closeRawModal);

  elements.btnCopyCsv.addEventListener('click', () => {
    navigator.clipboard.writeText(EXACT_DATASET_CSV).then(() => {
      showToast('CSV dataset copied to clipboard!', 'success');
    });
  });

  // Export CSV
  elements.btnExportCsv.addEventListener('click', () => {
    const csvContent = exportExceptionsToCSV(state.evaluatedData.locations);
    downloadFile('franchise_exceptions_report_2026-08-15.csv', csvContent);
    showToast('Downloaded franchise compliance exceptions report (CSV)', 'success');
  });

  // Keyboard Shortcuts (Escape to close drawer or modal)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeDrawer();
      closeRuleModal();
      closeRawModal();
    }
  });
}

/**
 * Application Bootstrap
 */
async function init() {
  try {
    state.rawLocations = await loadLocations();
    setupEventListeners();
    runRuleEngine();
  } catch (err) {
    console.error('Initialization error:', err);
    showToast('Error loading location data: ' + err.message, 'danger');
  }
}

// Start the app on DOM ready
document.addEventListener('DOMContentLoaded', init);
