import { parseCSV } from './js/data.js';
import { evaluateFranchiseNetwork, DEFAULT_CONFIG } from './js/engine.js';
import fs from 'fs';
import path from 'path';

const csvPath = path.resolve('./data/locations.csv');
const csvData = fs.readFileSync(csvPath, 'utf8');
const locations = parseCSV(csvData);

console.log('Loaded locations count:', locations.length);

const result = evaluateFranchiseNetwork(locations, DEFAULT_CONFIG);

console.log('\n--- KPI SUMMARY ---');
console.log('Total Locations:', result.kpis.totalLocations);
console.log('Flagged Count:', result.kpis.flaggedCount);
console.log('High Priority Count:', result.kpis.highPriorityCount);
console.log('Medium Priority Count:', result.kpis.mediumPriorityCount);
console.log('Clean Count:', result.kpis.cleanCount);
console.log('Rule 1 (Missing/Late):', result.kpis.ruleCounts.missingLate);
console.log('Rule 2 (Sales Anomaly):', result.kpis.ruleCounts.salesAnomaly);
console.log('Rule 3 (Expense Anomaly):', result.kpis.ruleCounts.expenseAnomaly);
console.log('Rule 4 (Chronic Late):', result.kpis.ruleCounts.chronicLate);

console.log('\n--- RANKED EXCEPTIONS TABLE ---');
result.flagged.forEach(loc => {
  console.log(`Rank #${loc.rank} [${loc.priority}] | ${loc.location_id} - ${loc.location_name} | ${loc.exceptionType} | ${loc.reason}`);
});

// Assertions to verify correctness:
if (result.kpis.totalLocations !== 20) throw new Error('Expected 20 locations');
if (result.kpis.flaggedCount !== 5) throw new Error(`Expected 5 flagged locations, got ${result.kpis.flaggedCount}`);
if (result.kpis.highPriorityCount !== 3) throw new Error(`Expected 3 high priority locations, got ${result.kpis.highPriorityCount}`);
if (result.kpis.ruleCounts.missingLate !== 2) throw new Error('Expected 2 missing/late');
if (result.kpis.ruleCounts.salesAnomaly !== 1) throw new Error('Expected 1 sales anomaly');
if (result.kpis.ruleCounts.expenseAnomaly !== 1) throw new Error('Expected 1 expense anomaly');
if (result.kpis.ruleCounts.chronicLate !== 1) throw new Error('Expected 1 chronic late');

console.log('\n>>> ALL 4 RULES & KPI ASSERTIONS PASSED PERFECTLY! <<<');
