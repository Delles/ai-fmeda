import { FmedaNode } from '../types/fmeda';
import { recalculateAllTotals } from './calculations';

const sampleNodes: Record<string, FmedaNode> = {
  'sys-1': {
    id: 'sys-1',
    name: 'Brake System',
    type: 'System',
    parentId: null,
    childIds: ['sub-1'],
  },
  'sub-1': {
    id: 'sub-1',
    name: 'Brake Controller',
    type: 'Subsystem',
    parentId: 'sys-1',
    childIds: ['comp-1'],
  },
  'comp-1': {
    id: 'comp-1',
    name: 'MCU',
    type: 'Component',
    parentId: 'sub-1',
    childIds: ['func-1'],
  },
  'func-1': {
    id: 'func-1',
    name: 'Process Braking Command',
    type: 'Function',
    parentId: 'comp-1',
    childIds: ['fm-1', 'fm-2'],
  },
  'fm-1': {
    id: 'fm-1',
    name: 'No output',
    type: 'FailureMode',
    parentId: 'func-1',
    childIds: [],
    fitRate: 100,
    diagnosticCoverage: 0.9,
    classification: 'Dangerous',
  },
  'fm-2': {
    id: 'fm-2',
    name: 'Safe failure',
    type: 'FailureMode',
    parentId: 'func-1',
    childIds: [],
    fitRate: 50,
    diagnosticCoverage: 0,
    classification: 'Safe',
  },
};

console.log('Testing calculations for nested hierarchy (ISO 26262 DC logic)...');
const updatedNodes = recalculateAllTotals(sampleNodes);

const fm1 = updatedNodes['fm-1'];
const fm2 = updatedNodes['fm-2'];
const func1 = updatedNodes['func-1'];
const sys1 = updatedNodes['sys-1'];

const assertNear = (actual: number | undefined, expected: number, name: string) => {
  const val = actual || 0;
  if (Math.abs(val - expected) < 0.0001) {
    console.log(`✅ ${name}: ${val} (Expected: ${expected})`);
    return true;
  } else {
    console.log(`❌ ${name}: ${val} (Expected: ${expected})`);
    return false;
  }
};

let allPassed = true;

console.log('\nFailure Mode 1 (Dangerous, 100 FIT, 90% DC):');
allPassed = assertNear(fm1.totalFit, 100, 'Total FIT') && allPassed;
allPassed = assertNear(fm1.safeFit, 90, 'Safe FIT (Detected)') && allPassed;
allPassed = assertNear(fm1.dangerousFit, 100, 'Dangerous FIT') && allPassed;
allPassed = assertNear(fm1.avgDc, 0.9, 'Avg DC') && allPassed;

console.log('\nFailure Mode 2 (Safe, 50 FIT, 0% DC):');
allPassed = assertNear(fm2.totalFit, 50, 'Total FIT') && allPassed;
allPassed = assertNear(fm2.safeFit, 50, 'Safe FIT') && allPassed;
allPassed = assertNear(fm2.dangerousFit, 0, 'Dangerous FIT') && allPassed;
allPassed = assertNear(fm2.avgDc, 1.0, 'Avg DC') && allPassed;

console.log('\nFunction 1 (FM1 + FM2):');
allPassed = assertNear(func1.totalFit, 150, 'Total FIT') && allPassed;
allPassed = assertNear(func1.safeFit, 140, 'Safe FIT (FM1 Detected + FM2 Safe)') && allPassed;
allPassed = assertNear(func1.dangerousFit, 100, 'Dangerous FIT (only FM1)') && allPassed;
allPassed = assertNear(func1.avgDc, 0.9, 'Avg DC (90/100)') && allPassed;

console.log('\nSystem 1 (Sub1 -> Comp1 -> Func1):');
allPassed = assertNear(sys1.totalFit, 150, 'Total FIT') && allPassed;
allPassed = assertNear(sys1.avgDc, 0.9, 'Avg DC') && allPassed;

if (allPassed) {
  console.log('\n✅ Calculation verification successful');
} else {
  console.log('\n❌ Calculation verification failed');
  process.exit(1);
}
