import { migrateLegacyToFlat, isLegacyFormat, flattenDeepHierarchy } from './migration';
import { FmedaComponent } from '../types/fmeda';
import { FmedaSystemDeep } from '../types/ai';

const sampleLegacyData: FmedaComponent[] = [
  {
    id: 'comp-1',
    name: 'Brake Controller',
    functions: [
      {
        id: 'func-1',
        name: 'Apply Braking Force',
        failureModes: [
          {
            id: 'fm-1',
            name: 'No braking force',
            localEffect: 'Vehicle does not slow down',
            safetyMechanism: 'Redundant brake system',
            diagnosticCoverage: 0.99,
            fitRate: 10
          },
          {
            id: 'fm-2',
            name: 'Delayed braking force',
            localEffect: 'Increased stopping distance',
            safetyMechanism: 'None',
            diagnosticCoverage: 0,
            fitRate: 5
          }
        ]
      }
    ]
  }
];

console.log('Testing isLegacyFormat...');
console.log('Is legacy format:', isLegacyFormat(sampleLegacyData));

console.log('\nTesting migrateLegacyToFlat...');
const flatNodes = migrateLegacyToFlat(sampleLegacyData);

console.log('Number of nodes:', Object.keys(flatNodes).length);
console.log('Nodes:', JSON.stringify(flatNodes, null, 2));

// Basic verification
const comp = flatNodes['comp-1'];
if (comp && comp.type === 'Component' && comp.childIds.includes('func-1')) {
  console.log('\n✅ Component migration successful');
} else {
  console.log('\n❌ Component migration failed');
}

const func = flatNodes['func-1'];
if (func && func.type === 'Function' && func.parentId === 'comp-1' && func.childIds.includes('fm-1')) {
  console.log('✅ Function migration successful');
} else {
  console.log('❌ Function migration failed');
}

const fm = flatNodes['fm-1'];
if (fm && fm.type === 'FailureMode' && fm.parentId === 'func-1' && fm.fitRate === 10) {
  console.log('✅ Failure Mode migration successful');
} else {
  console.log('❌ Failure Mode migration failed');
}

const sampleDeepData: FmedaSystemDeep[] = [
  {
    name: 'Braking System',
    asil: 'ASIL D',
    safetyGoal: 'Prevent unintended braking',
    subsystems: [
      {
        name: 'Hydraulic Subsystem',
        asil: 'ASIL D',
        components: [
          {
            name: 'Brake Caliper',
            asil: 'ASIL C',
            functions: [
              {
                name: 'Apply friction to rotor',
                failureModes: [
                  {
                    name: 'Stuck caliper',
                    localEffect: 'Continuous braking',
                    safetyMechanism: 'Driver override',
                    diagnosticCoverage: 0.9,
                    fitRate: 15,
                    classification: 'Dangerous'
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
];

console.log('\nTesting flattenDeepHierarchy...');
const flatDeepNodes = flattenDeepHierarchy(sampleDeepData);

const deepNodesList = Object.values(flatDeepNodes);
console.log('Number of deep nodes flattened:', deepNodesList.length);

const systemNode = deepNodesList.find(n => n.type === 'System');
const subsystemNode = deepNodesList.find(n => n.type === 'Subsystem');
const componentNode = deepNodesList.find(n => n.type === 'Component');
const functionNode = deepNodesList.find(n => n.type === 'Function');
const failureModeNode = deepNodesList.find(n => n.type === 'FailureMode');

if (
  systemNode && subsystemNode && componentNode && functionNode && failureModeNode &&
  systemNode.childIds.includes(subsystemNode.id) &&
  subsystemNode.parentId === systemNode.id &&
  subsystemNode.childIds.includes(componentNode.id) &&
  componentNode.parentId === subsystemNode.id &&
  componentNode.childIds.includes(functionNode.id) &&
  functionNode.parentId === componentNode.id &&
  functionNode.childIds.includes(failureModeNode.id) &&
  failureModeNode.parentId === functionNode.id
) {
  console.log('✅ Deep hierarchy flattening successful');
} else {
  console.log('❌ Deep hierarchy flattening failed');
}
