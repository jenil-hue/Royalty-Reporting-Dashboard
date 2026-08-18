# Franchise Exception Monitor

A dashboard web application for compliance officers and franchise operations managers to monitor location-level royalty & sales reporting exceptions in real time.

## Overview

The **Franchise Exception Monitor** ingests 20 franchise location reporting records and runs a 4-rule compliance engine to surface operational exceptions, revenue deficits, and delinquency risks.

---

## 4 Compliance Rules & Thresholds

| Rule ID | Exception Name | Deterministic Rule Logic | Plain-English Reason Example | Priority Assignment |
| :--- | :--- | :--- | :--- | :--- |
| **Rule 1** | **Missing / Late** | `report_date` is `null` OR `report_date - expected_date > 2 days` | *"Report missing for current cycle (expected 2026-08-15)"* | **High** if missing or &ge;4d late; **Medium** if 3d late |
| **Rule 2** | **Sales Anomaly** | `gross_sales` is > 30% below `trailing_avg_sales` | *"Reported sales 42.3% below its own trailing average ($17,200 vs $29,800 benchmark)"* | **High** if drop &ge;40%; **Medium** if 30–39% |
| **Rule 3** | **Expense Anomaly** | `expense_amount` is > 2.0x `trailing_avg_expense` | *"Supplies expense of $2,280 is 2.4x the trailing average ($950 norm)"* | **High** if &ge;3.0x or &Delta;>$5,000; **Medium** if 2.0x–2.9x |
| **Rule 4** | **Chronic Late** | `late_reports_last_6_cycles` &ge; 3 | *"Location has been late 3 times in the trailing 6 cycles"* | **High** if late &ge;4; **Medium** if 3 |

---

## Dataset & Exception Summary (20 Locations)

Out of 20 total franchise locations monitored in the August 15, 2026 cycle:
- **5 Locations Flagged (25.0% exception rate)**:
  1. **Rank #1 — L008 Tempe Marketplace (Suite)**: Sales Anomaly — Sales of $17,200 dropped 42.3% below trailing average ($29,800). **[High Priority]**
  2. **Rank #2 — L005 Cherry Creek Denver (Suite)**: Missing Report — No report submitted for expected date 2026-08-15 ($29,500 unsubmitted volume at risk). **[High Priority]**
  3. **Rank #3 — L016 Southlake Town Square (Suite)**: Missing Report — No report submitted for expected date 2026-08-15 ($28,400 unsubmitted volume at risk). **[High Priority]**
  4. **Rank #4 — L018 Biltmore Phoenix (Flagship)**: Expense Anomaly — Supplies expense of $2,280 is 2.4x the $950 trailing average (+$1,330 variance). **[Medium Priority]**
  5. **Rank #5 — L011 Deerfield Beach (Suite)**: Chronic Delinquency — 3 late submissions in the last 6 reporting cycles. **[Medium Priority]**
- **15 Locations Clean (75.0% compliance pass rate)**.

---

## Key Dashboard Capabilities

1. **Ranked Exception Table**: High-density tabular layout sorted by priority (*High* &rarr; *Medium* &rarr; *Low*) and variance severity.
2. **Summary Strip & KPIs**: Instant executive visibility into total units, flagged exceptions, high priority items, compliance pass rate, and royalty volume at risk.
3. **Exception Type Filter Chips**: One-click toggles for *All Flagged*, *Missing / Late*, *Sales Anomaly*, *Expense Anomaly*, *Chronic Late*, and *Full Network (All 20)*.
4. **Live Search**: Instant text filtering by location name, ID, or format.
5. **Slide-Over Forensic Inspection Drawer**: Click any row to view financial diagnostics, variance gauges, 6-cycle reporting history visualizer, and trigger action workflows (*Send Notice*, *Request Audit*, *Mark Resolved*).
6. **Live Rule Engine Tuner**: Interactive modal to adjust thresholds in real-time with instant recalculation.
7. **CSV Export & Raw Inspector**: Download compliance report CSV with a single click.

---

## How to Run Locally

You can run this app with any local HTTP server. For example:

### Using Python:
```bash
python -m http.server 8000
```
Then navigate to `http://localhost:8000` in your web browser.

### Direct File Open:
Because all datasets and ES modules are built cleanly, you can also launch `index.html` directly in modern web browsers.
