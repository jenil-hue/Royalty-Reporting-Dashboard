/**
 * Data management & CSV parsing for Franchise Exception Monitor
 * Uses the exact 20 franchise locations dataset
 */

export const EXACT_DATASET_CSV = `location_id,location_name,format,report_date,expected_date,gross_sales,trailing_avg_sales,expense_category,expense_amount,trailing_avg_expense,late_reports_last_6_cycles
L001,Downtown Denver,Flagship,2026-08-15,2026-08-15,48200,46500,Utilities,1150,1080,0
L002,Scottsdale Fashion Square,Suite,2026-08-15,2026-08-15,31400,30800,Supplies,890,910,0
L003,Buckhead Atlanta,Flagship,2026-08-14,2026-08-15,52100,51000,Rent,6200,6200,1
L004,River Oaks Houston,Suite,2026-08-15,2026-08-15,27300,26900,Marketing,1400,1350,0
L005,Cherry Creek Denver,Suite,,2026-08-15,,29500,Supplies,,780,2
L006,Fashion Valley San Diego,Flagship,2026-08-15,2026-08-15,49800,48200,Utilities,1200,1150,0
L007,Perimeter Mall Atlanta,Suite,2026-08-15,2026-08-15,28900,29100,Supplies,820,800,0
L008,Tempe Marketplace,Suite,2026-08-15,2026-08-15,17200,29800,Payroll,8100,8000,0
L009,Legacy West Plano,Flagship,2026-08-15,2026-08-15,53400,52100,Utilities,1180,1140,0
L010,Old Town Scottsdale,Suite,2026-08-15,2026-08-15,30200,29900,Marketing,1250,1300,1
L011,Deerfield Beach,Suite,2026-08-13,2026-08-15,26800,27200,Supplies,760,790,3
L012,Domain Austin,Flagship,2026-08-15,2026-08-15,51200,49800,Rent,5800,5800,0
L013,North Point Alpharetta,Suite,2026-08-15,2026-08-15,29600,29200,Utilities,590,610,0
L014,Gaslamp Quarter San Diego,Suite,2026-08-15,2026-08-15,31900,31200,Supplies,870,850,0
L015,Uptown Charlotte,Flagship,2026-08-15,2026-08-15,47600,46900,Marketing,2050,1900,0
L016,Southlake Town Square,Suite,,2026-08-15,,28400,Payroll,,7200,1
L017,Cool Springs Nashville,Suite,2026-08-15,2026-08-15,29100,28800,Utilities,640,620,0
L018,Biltmore Phoenix,Flagship,2026-08-15,2026-08-15,50300,49600,Supplies,2280,950,0
L019,Rittenhouse Square Philly,Suite,2026-08-15,2026-08-15,32200,31700,Rent,4100,4100,0
L020,Country Club Plaza KC,Suite,2026-08-15,2026-08-15,28700,28300,Marketing,1150,1120,0`;

/**
 * Robust CSV parser that handles quotes, empty values, and headers
 */
export function parseCSV(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  const records = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Split taking into account simple CSV
    const values = [];
    let insideQuotes = false;
    let currentValue = '';

    for (let char of line) {
      if (char === '"') {
        insideQuotes = !insideQuotes;
      } else if (char === ',' && !insideQuotes) {
        values.push(currentValue.trim());
        currentValue = '';
      } else {
        currentValue += char;
      }
    }
    values.push(currentValue.trim());

    const record = {};
    headers.forEach((header, idx) => {
      const val = values[idx] !== undefined ? values[idx] : '';
      // Map nulls
      record[header] = val === '' ? null : val;
    });

    records.push(record);
  }

  return records;
}

/**
 * Load locations from data/locations.csv or fallback to embedded exact dataset
 */
export async function loadLocations() {
  try {
    const res = await fetch('data/locations.csv');
    if (res.ok) {
      const text = await res.text();
      return parseCSV(text);
    }
  } catch (err) {
    console.warn('Could not fetch data/locations.csv, using embedded exact dataset.', err);
  }
  return parseCSV(EXACT_DATASET_CSV);
}

/**
 * Convert evaluated exceptions to downloadable CSV
 */
export function exportExceptionsToCSV(evaluatedLocations) {
  const headers = [
    'Rank',
    'Location ID',
    'Location Name',
    'Format',
    'Exception Type',
    'Priority',
    'Reason',
    'Report Date',
    'Expected Date',
    'Gross Sales',
    'Trailing Avg Sales',
    'Expense Category',
    'Expense Amount',
    'Trailing Avg Expense',
    'Late Cycles (Last 6)'
  ];

  const rows = evaluatedLocations.map(loc => [
    loc.rank || '—',
    `"${loc.location_id || ''}"`,
    `"${loc.location_name || ''}"`,
    `"${loc.format || ''}"`,
    `"${loc.exceptionType || 'Compliant'}"`,
    `"${loc.priority || 'Clean'}"`,
    `"${(loc.reason || '').replace(/"/g, '""')}"`,
    loc.report_date || 'MISSING',
    loc.expected_date || '',
    loc.gross_sales !== null ? loc.gross_sales : 'N/A',
    loc.trailing_avg_sales !== null ? loc.trailing_avg_sales : 'N/A',
    `"${loc.expense_category || ''}"`,
    loc.expense_amount !== null ? loc.expense_amount : 'N/A',
    loc.trailing_avg_expense !== null ? loc.trailing_avg_expense : 'N/A',
    loc.late_reports_last_6_cycles || 0
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(r => r.join(','))
  ].join('\n');

  return csvContent;
}

/**
 * Trigger browser file download
 */
export function downloadFile(filename, content, mimeType = 'text/csv;charset=utf-8;') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
