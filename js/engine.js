/**
 * Franchise Exception Monitor - Compliance Rule Engine
 * Deterministic evaluation of franchise location reports
 */

export const DEFAULT_CONFIG = {
  gracePeriodDays: 2,          // Rule 1: Flag if > 2 days past expected date
  salesAnomalyDropPct: 0.30,   // Rule 2: Flag if gross_sales > 30% below trailing average
  expenseAnomalyMultiplier: 2.0, // Rule 3: Flag if expense > 2x trailing average
  chronicLateCountThreshold: 3 // Rule 4: Flag if late 3+ times in trailing 6 cycles
};

/**
 * Calculate difference in days between two ISO date strings (dateA - dateB)
 */
export function daysBetween(dateStrA, dateStrB) {
  if (!dateStrA || !dateStrB) return null;
  const dA = new Date(dateStrA);
  const dB = new Date(dateStrB);
  const diffTime = dA.getTime() - dB.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Format currency nicely
 */
export function formatCurrency(num) {
  if (num === null || num === undefined || isNaN(num)) return '—';
  return '$' + Number(num).toLocaleString('en-US');
}

/**
 * Evaluate a single franchise location against compliance rules
 * @param {Object} loc - Franchise location record
 * @param {Object} config - Configuration thresholds
 * @returns {Object} Evaluation result with flags, reasons, and priority
 */
export function evaluateLocation(loc, config = DEFAULT_CONFIG) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const exceptions = [];

  // Parse numeric values safely
  const grossSales = loc.gross_sales !== null && loc.gross_sales !== '' ? Number(loc.gross_sales) : null;
  const trailingAvgSales = loc.trailing_avg_sales !== null && loc.trailing_avg_sales !== '' ? Number(loc.trailing_avg_sales) : null;
  const expenseAmount = loc.expense_amount !== null && loc.expense_amount !== '' ? Number(loc.expense_amount) : null;
  const trailingAvgExpense = loc.trailing_avg_expense !== null && loc.trailing_avg_expense !== '' ? Number(loc.trailing_avg_expense) : null;
  const lateCount = Number(loc.late_reports_last_6_cycles || 0);

  // -------------------------------------------------------------
  // RULE 1: MISSING / LATE
  // report_date is null OR > 2 days past expected_date
  // -------------------------------------------------------------
  const isDateMissing = !loc.report_date || loc.report_date.trim() === '';
  let daysOverdue = 0;
  let isLate = false;

  if (isDateMissing) {
    // Missing report is a critical compliance exception
    exceptions.push({
      ruleId: 'MISSING_LATE',
      type: 'Missing / Late',
      shortType: 'Missing Report',
      reason: `Report missing for current cycle (expected ${loc.expected_date || 'on schedule'})`,
      priority: 'High',
      severityScore: 90 + lateCount * 2,
      metric: 'Missing Submission',
      varianceText: 'No Data Received',
      tagColor: 'red',
      details: {
        isMissing: true,
        expectedDate: loc.expected_date,
        reportDate: null
      }
    });
  } else {
    daysOverdue = daysBetween(loc.report_date, loc.expected_date);
    if (daysOverdue > cfg.gracePeriodDays) {
      isLate = true;
      const isExtremeLate = daysOverdue >= 4;
      const priority = isExtremeLate ? 'High' : 'Medium';
      const severityScore = isExtremeLate ? (80 + daysOverdue * 3) : (50 + daysOverdue * 2);
      
      exceptions.push({
        ruleId: 'MISSING_LATE',
        type: 'Missing / Late',
        shortType: 'Late Submission',
        reason: `Report submitted ${daysOverdue} days past deadline (Received ${loc.report_date} vs ${loc.expected_date} expected)`,
        priority,
        severityScore,
        metric: `+${daysOverdue} days late`,
        varianceText: `${daysOverdue}d Past Cutoff`,
        tagColor: priority === 'High' ? 'red' : 'amber',
        details: {
          isMissing: false,
          daysOverdue,
          reportDate: loc.report_date,
          expectedDate: loc.expected_date
        }
      });
    }
  }

  // -------------------------------------------------------------
  // RULE 2: SALES ANOMALY
  // gross_sales is more than 30% below trailing_avg_sales
  // -------------------------------------------------------------
  if (grossSales !== null && trailingAvgSales !== null && trailingAvgSales > 0) {
    const salesDrop = (trailingAvgSales - grossSales) / trailingAvgSales;
    if (salesDrop > cfg.salesAnomalyDropPct) {
      const dropPctFormatted = (salesDrop * 100).toFixed(1);
      const dollarDeficit = trailingAvgSales - grossSales;
      const isSevereDrop = salesDrop >= 0.40;
      const priority = isSevereDrop ? 'High' : 'Medium';
      const severityScore = 85 + Math.round(salesDrop * 50);

      exceptions.push({
        ruleId: 'SALES_ANOMALY',
        type: 'Sales Anomaly',
        shortType: 'Sales Deficit',
        reason: `Reported sales ${dropPctFormatted}% below its own trailing average (${formatCurrency(grossSales)} vs ${formatCurrency(trailingAvgSales)} benchmark)`,
        priority,
        severityScore,
        metric: `-${dropPctFormatted}% drop`,
        varianceText: `-$${dollarDeficit.toLocaleString()} vs Avg`,
        tagColor: priority === 'High' ? 'red' : 'amber',
        details: {
          grossSales,
          trailingAvgSales,
          dropPct: dropPctFormatted,
          dollarDeficit
        }
      });
    }
  }

  // -------------------------------------------------------------
  // RULE 3: EXPENSE ANOMALY
  // expense_amount is more than 2x trailing_avg_expense for that category
  // -------------------------------------------------------------
  if (expenseAmount !== null && trailingAvgExpense !== null && trailingAvgExpense > 0) {
    const ratio = expenseAmount / trailingAvgExpense;
    if (ratio > cfg.expenseAnomalyMultiplier) {
      const multiplierFormatted = ratio.toFixed(1);
      const dollarSpike = expenseAmount - trailingAvgExpense;
      const isExtremeSpike = ratio >= 3.0 || dollarSpike > 5000;
      const priority = isExtremeSpike ? 'High' : 'Medium';
      const severityScore = 60 + Math.min(35, Math.round((ratio - 2) * 20));
      const category = loc.expense_category || 'Operating';

      exceptions.push({
        ruleId: 'EXPENSE_ANOMALY',
        type: 'Expense Anomaly',
        shortType: 'Expense Spike',
        reason: `${category} expense of ${formatCurrency(expenseAmount)} is ${multiplierFormatted}x the trailing average (${formatCurrency(trailingAvgExpense)} norm)`,
        priority,
        severityScore,
        metric: `${multiplierFormatted}x baseline`,
        varianceText: `+$${dollarSpike.toLocaleString()} (${category})`,
        tagColor: priority === 'High' ? 'red' : 'amber',
        details: {
          category,
          expenseAmount,
          trailingAvgExpense,
          ratio: multiplierFormatted,
          dollarSpike
        }
      });
    }
  }

  // -------------------------------------------------------------
  // RULE 4: CHRONIC LATE
  // location has been late 3+ times in the trailing history
  // -------------------------------------------------------------
  if (lateCount >= cfg.chronicLateCountThreshold) {
    const isSevereDelinquency = lateCount >= 4;
    const priority = isSevereDelinquency ? 'High' : 'Medium';
    const severityScore = 55 + lateCount * 5;

    exceptions.push({
      ruleId: 'CHRONIC_LATE',
      type: 'Chronic Late',
      shortType: 'Delinquent Filer',
      reason: `Location has been late ${lateCount} times in the trailing 6 cycles`,
      priority,
      severityScore,
      metric: `${lateCount}/6 cycles late`,
      varianceText: `${lateCount} Late Reports`,
      tagColor: priority === 'High' ? 'red' : 'amber',
      details: {
        lateCount,
        totalCyclesEvaluated: 6
      }
    });
  }

  // -------------------------------------------------------------
  // Consolidate & Determine Overall Priority & Severity
  // -------------------------------------------------------------
  const isFlagged = exceptions.length > 0;
  
  // Calculate priority hierarchy
  let overallPriority = 'Clean';
  let primaryException = null;
  let consolidatedReason = 'Compliant: All metrics within operational variance bounds.';
  let overallSeverityScore = 0;

  if (isFlagged) {
    // Sort exceptions by severity score descending
    exceptions.sort((a, b) => b.severityScore - a.severityScore);
    primaryException = exceptions[0];

    const hasHigh = exceptions.some(e => e.priority === 'High');
    const hasMedium = exceptions.some(e => e.priority === 'Medium');
    overallPriority = hasHigh ? 'High' : (hasMedium ? 'Medium' : 'Low');

    // Aggregate score: top score + boost for multiple flags
    overallSeverityScore = primaryException.severityScore + (exceptions.length - 1) * 15;

    // Build plain English primary reason
    if (exceptions.length === 1) {
      consolidatedReason = primaryException.reason;
    } else {
      // Multi-anomaly consolidated summary
      const otherRules = exceptions.slice(1).map(e => e.type).join(', ');
      consolidatedReason = `${primaryException.reason} [Also flagged: ${otherRules}]`;
    }
  }

  return {
    ...loc,
    gross_sales: grossSales,
    trailing_avg_sales: trailingAvgSales,
    expense_amount: expenseAmount,
    trailing_avg_expense: trailingAvgExpense,
    late_reports_last_6_cycles: lateCount,
    isFlagged,
    exceptionCount: exceptions.length,
    exceptions,
    primaryException,
    exceptionType: isFlagged 
      ? (exceptions.length > 1 ? `${primaryException.type} +${exceptions.length - 1}` : primaryException.type)
      : 'Compliant',
    primaryRuleId: primaryException ? primaryException.ruleId : null,
    reason: consolidatedReason,
    priority: overallPriority,
    severityScore: overallSeverityScore
  };
}

/**
 * Evaluate full list of franchise locations and assign ranks
 * @param {Array} locations - List of franchise records
 * @param {Object} config - Config thresholds
 * @returns {Object} Evaluation summary, ranked flagged list, and complete list
 */
export function evaluateFranchiseNetwork(locations, config = DEFAULT_CONFIG) {
  const evaluated = locations.map(loc => evaluateLocation(loc, config));

  // Partition into flagged and clean
  const flagged = evaluated.filter(loc => loc.isFlagged);
  const clean = evaluated.filter(loc => !loc.isFlagged);

  // Priority weight for sorting: High = 3, Medium = 2, Low = 1
  const priorityWeight = { 'High': 300, 'Medium': 200, 'Low': 100, 'Clean': 0 };

  // Sort flagged locations: First by Priority (High -> Medium -> Low), then by Severity Score descending
  flagged.sort((a, b) => {
    const pDiff = (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0);
    if (pDiff !== 0) return pDiff;
    return b.severityScore - a.severityScore;
  });

  // Assign 1-based ranks to flagged items
  flagged.forEach((loc, index) => {
    loc.rank = index + 1;
  });

  // Also give clean locations alphabetical sorting
  clean.sort((a, b) => a.location_name.localeCompare(b.location_name));
  clean.forEach(loc => {
    loc.rank = '—';
  });

  // KPI calculations
  const totalLocations = evaluated.length;
  const flaggedCount = flagged.length;
  const highPriorityCount = flagged.filter(loc => loc.priority === 'High').length;
  const mediumPriorityCount = flagged.filter(loc => loc.priority === 'Medium').length;
  const lowPriorityCount = flagged.filter(loc => loc.priority === 'Low').length;
  const cleanCount = clean.length;

  // Breakdown by rule type
  const missingLateCount = evaluated.filter(loc => loc.exceptions.some(e => e.ruleId === 'MISSING_LATE')).length;
  const salesAnomalyCount = evaluated.filter(loc => loc.exceptions.some(e => e.ruleId === 'SALES_ANOMALY')).length;
  const expenseAnomalyCount = evaluated.filter(loc => loc.exceptions.some(e => e.ruleId === 'EXPENSE_ANOMALY')).length;
  const chronicLateCount = evaluated.filter(loc => loc.exceptions.some(e => e.ruleId === 'CHRONIC_LATE')).length;

  // Total royalty / sales at risk
  let totalSalesDeficit = 0;
  flagged.forEach(loc => {
    if (loc.gross_sales !== null && loc.trailing_avg_sales !== null && loc.trailing_avg_sales > loc.gross_sales) {
      totalSalesDeficit += (loc.trailing_avg_sales - loc.gross_sales);
    } else if (loc.gross_sales === null && loc.trailing_avg_sales !== null) {
      // Unreported volume at risk
      totalSalesDeficit += loc.trailing_avg_sales;
    }
  });

  return {
    locations: evaluated,
    flagged,
    clean,
    kpis: {
      totalLocations,
      flaggedCount,
      flaggedPercentage: totalLocations > 0 ? ((flaggedCount / totalLocations) * 100).toFixed(1) : '0',
      highPriorityCount,
      mediumPriorityCount,
      lowPriorityCount,
      cleanCount,
      cleanPercentage: totalLocations > 0 ? ((cleanCount / totalLocations) * 100).toFixed(1) : '0',
      totalSalesDeficit,
      ruleCounts: {
        missingLate: missingLateCount,
        salesAnomaly: salesAnomalyCount,
        expenseAnomaly: expenseAnomalyCount,
        chronicLate: chronicLateCount
      }
    }
  };
}
