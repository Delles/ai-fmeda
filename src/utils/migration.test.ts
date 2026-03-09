import { describe, it, expect } from 'vitest';
import { migrateLegacyToFlat, isLegacyFormat, flattenDeepHierarchy } from './migration';
import { FmedaComponent } from '../types/fmeda';
import { FmedaSystemDeep } from '../types/ai';

describe('Migration Utility', () => {
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

  it('correctly identifies legacy format', () => {
    expect(isLegacyFormat(sampleLegacyData)).toBe(true);
    expect(isLegacyFormat({})).toBe(false);
  });

  it('migrates legacy component to flat structure', () => {
    const flatNodes = migrateLegacyToFlat(sampleLegacyData);

    expect(Object.keys(flatNodes)).toHaveLength(4); // Component + Function + 2 Failure Modes

    const comp = flatNodes['comp-1'];
    expect(comp).toBeDefined();
    expect(comp.type).toBe('Component');
    expect(comp.childIds).toContain('func-1');

    const func = flatNodes['func-1'];
    expect(func).toBeDefined();
    expect(func.type).toBe('Function');
    expect(func.parentId).toBe('comp-1');
    expect(func.childIds).toContain('fm-1');
    expect(func.childIds).toContain('fm-2');

    const fm1 = flatNodes['fm-1'];
    expect(fm1).toBeDefined();
    expect(fm1.type).toBe('FailureMode');
    expect(fm1.parentId).toBe('func-1');
    expect(fm1.fitRate).toBe(10);
  });

  it('flattens deep hierarchy correctly', () => {
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

    const flatDeepNodes = flattenDeepHierarchy(sampleDeepData);
    const nodes = Object.values(flatDeepNodes);

    const system = nodes.find(n => n.type === 'System');
    const subsystem = nodes.find(n => n.type === 'Subsystem');
    const component = nodes.find(n => n.type === 'Component');
    const func = nodes.find(n => n.type === 'Function');
    const fm = nodes.find(n => n.type === 'FailureMode');

    expect(system).toBeDefined();
    expect(subsystem).toBeDefined();
    expect(component).toBeDefined();
    expect(func).toBeDefined();
    expect(fm).toBeDefined();

    expect(system?.childIds).toContain(subsystem?.id);
    expect(subsystem?.parentId).toBe(system?.id);
    expect(subsystem?.childIds).toContain(component?.id);
    expect(component?.parentId).toBe(subsystem?.id);
    expect(component?.childIds).toContain(func?.id);
    expect(func?.parentId).toBe(component?.id);
    expect(func?.childIds).toContain(fm?.id);
    expect(fm?.parentId).toBe(func?.id);
  });
});
