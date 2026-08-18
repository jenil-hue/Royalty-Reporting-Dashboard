import csv
from datetime import datetime

def test_franchise_rules():
    with open('data/locations.csv', mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    print(f"Total location rows loaded: {len(rows)}")

    flagged = []
    clean = []

    for r in rows:
        loc_id = r['location_id']
        name = r['location_name']
        rep_date = r['report_date'].strip() if r['report_date'] else None
        exp_date = r['expected_date'].strip() if r['expected_date'] else None
        gross_sales = float(r['gross_sales']) if r['gross_sales'] else None
        avg_sales = float(r['trailing_avg_sales']) if r['trailing_avg_sales'] else None
        exp_amt = float(r['expense_amount']) if r['expense_amount'] else None
        avg_exp = float(r['trailing_avg_expense']) if r['trailing_avg_expense'] else None
        late_cycles = int(r['late_reports_last_6_cycles']) if r['late_reports_last_6_cycles'] else 0
        category = r['expense_category']

        exceptions = []

        # Rule 1: Missing or > 2 days late
        if not rep_date:
            exceptions.append({
                'rule': 'MISSING_LATE',
                'type': 'Missing / Late',
                'reason': f"Report missing for current cycle (expected {exp_date})",
                'priority': 'High'
            })
        else:
            d_rep = datetime.strptime(rep_date, "%Y-%m-%d")
            d_exp = datetime.strptime(exp_date, "%Y-%m-%d")
            diff = (d_rep - d_exp).days
            if diff > 2:
                priority = 'High' if diff >= 4 else 'Medium'
                exceptions.append({
                    'rule': 'MISSING_LATE',
                    'type': 'Missing / Late',
                    'reason': f"Report submitted {diff} days past deadline (Received {rep_date} vs {exp_date} expected)",
                    'priority': priority
                })

        # Rule 2: Sales > 30% below avg
        if gross_sales is not None and avg_sales and avg_sales > 0:
            drop = (avg_sales - gross_sales) / avg_sales
            if drop > 0.30:
                drop_pct = round(drop * 100, 1)
                priority = 'High' if drop >= 0.40 else 'Medium'
                exceptions.append({
                    'rule': 'SALES_ANOMALY',
                    'type': 'Sales Anomaly',
                    'reason': f"Reported sales {drop_pct}% below its own trailing average (${gross_sales:,.0f} vs ${avg_sales:,.0f} benchmark)",
                    'priority': priority
                })

        # Rule 3: Expense > 2x avg
        if exp_amt is not None and avg_exp and avg_exp > 0:
            ratio = exp_amt / avg_exp
            if ratio > 2.0:
                priority = 'High' if ratio >= 3.0 or (exp_amt - avg_exp) > 5000 else 'Medium'
                exceptions.append({
                    'rule': 'EXPENSE_ANOMALY',
                    'type': 'Expense Anomaly',
                    'reason': f"{category} expense of ${exp_amt:,.0f} is {ratio:.1f}x the trailing average (${avg_exp:,.0f} norm)",
                    'priority': priority
                })

        # Rule 4: Chronic Late >= 3
        if late_cycles >= 3:
            priority = 'High' if late_cycles >= 4 else 'Medium'
            exceptions.append({
                'rule': 'CHRONIC_LATE',
                'type': 'Chronic Late',
                'reason': f"Location has been late {late_cycles} times in the trailing 6 cycles",
                'priority': priority
            })

        if exceptions:
            # Determine top priority
            prio = 'High' if any(e['priority'] == 'High' for e in exceptions) else 'Medium'
            flagged.append({
                'loc_id': loc_id,
                'name': name,
                'priority': prio,
                'exceptions': exceptions
            })
        else:
            clean.append(loc_id)

    print("\n--- TEST SUMMARY ---")
    print(f"Total: {len(rows)} | Flagged: {len(flagged)} | Clean: {len(clean)}")
    for f_item in flagged:
        print(f"[{f_item['priority']}] {f_item['loc_id']} - {f_item['name']}:")
        for ex in f_item['exceptions']:
            print(f"   -> ({ex['type']}) {ex['reason']}")

    assert len(rows) == 20, "Expected 20 locations"
    assert len(flagged) == 5, f"Expected 5 flagged, got {len(flagged)}"
    assert len(clean) == 15, f"Expected 15 clean, got {len(clean)}"
    print("\n>>> ALL VALIDATION CHECKS PASSED SUCCESSFULLY! <<<")

if __name__ == '__main__':
    test_franchise_rules()
