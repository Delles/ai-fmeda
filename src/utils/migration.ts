import { FmedaNode, FmedaComponent } from '../types/fmeda';
import { FmedaSystemDeep } from '../types/ai';
import { generateId } from '../utils/id';

/**
 * Migrates legacy nested FMEDA data to the new flat FmedaNode structure.
 *
 * Legacy structure: Component -> Function -> Failure Mode
 * New structure: Record<string, FmedaNode> with parentId/childIds
 *
 * @param legacy Array of legacy FmedaComponent objects
 * @returns A flat map of FmedaNode objects indexed by their IDs
 */
export function migrateLegacyToFlat(legacy: FmedaComponent[]): Record<string, FmedaNode> {
  const nodes: Record<string, FmedaNode> = {};

  legacy.forEach((component) => {
    const componentId = component.id || generateId();
    const functionIds: string[] = [];

    // Process functions within the component
    (component.functions || []).forEach((func) => {
      const functionId = func.id || generateId();
      const failureModeIds: string[] = [];

      // Process failure modes within the function
      (func.failureModes || []).forEach((fm) => {
        const failureModeId = fm.id || generateId();

        const failureModeNode: FmedaNode = {
          id: failureModeId,
          name: fm.name || 'Unnamed Failure Mode',
          type: 'FailureMode',
          parentId: functionId,
          childIds: [],
          localEffect: fm.localEffect || '',
          safetyMechanism: fm.safetyMechanism || '',
          diagnosticCoverage: fm.diagnosticCoverage ?? 0,
          fitRate: fm.fitRate ?? 0,
          classification: 'Safe', // Default value for new field
        };

        nodes[failureModeId] = failureModeNode;
        failureModeIds.push(failureModeId);
      });

      const functionNode: FmedaNode = {
        id: functionId,
        name: func.name || 'Unnamed Function',
        type: 'Function',
        parentId: componentId,
        childIds: failureModeIds,
      };

      nodes[functionId] = functionNode;
      functionIds.push(functionId);
    });

    // Create the component node
    const componentNode: FmedaNode = {
      id: componentId,
      name: component.name || 'Unnamed Component',
      type: 'Component',
      parentId: null, // Root nodes have null parentId
      childIds: functionIds,
      asil: 'QM', // Default value for new field
      safetyGoal: '', // Default value for new field
    };

    nodes[componentId] = componentNode;
  });

  return nodes;
}

/**
 * Flattens a deep nested hierarchy of FMEDA systems into a flat map of FmedaNode objects.
 *
 * @param systems Array of deep nested FmedaSystemDeep objects
 * @returns A flat map of FmedaNode objects indexed by their IDs
 */
export function flattenDeepHierarchy(systems: FmedaSystemDeep[]): Record<string, FmedaNode> {
  const nodes: Record<string, FmedaNode> = {};

  systems.forEach((system) => {
    const systemId = generateId();
    const subsystemIds: string[] = [];

    (system.subsystems || []).forEach((subsystem) => {
      const subsystemId = generateId();
      const componentIds: string[] = [];

      (subsystem.components || []).forEach((component) => {
        const componentId = generateId();
        const functionIds: string[] = [];

        (component.functions || []).forEach((func) => {
          const functionId = generateId();
          const failureModeIds: string[] = [];

          (func.failureModes || []).forEach((fm) => {
            const failureModeId = generateId();

            nodes[failureModeId] = {
              id: failureModeId,
              name: fm.name || 'Unnamed Failure Mode',
              type: 'FailureMode',
              parentId: functionId,
              childIds: [],
              localEffect: fm.localEffect || '',
              safetyMechanism: fm.safetyMechanism || '',
              diagnosticCoverage: fm.diagnosticCoverage ?? 0,
              fitRate: fm.fitRate ?? 0,
              classification: fm.classification || 'Safe',
            };
            failureModeIds.push(failureModeId);
          });

          nodes[functionId] = {
            id: functionId,
            name: func.name || 'Unnamed Function',
            type: 'Function',
            parentId: componentId,
            childIds: failureModeIds,
          };
          functionIds.push(functionId);
        });

        nodes[componentId] = {
          id: componentId,
          name: component.name || 'Unnamed Component',
          type: 'Component',
          parentId: subsystemId,
          childIds: functionIds,
          asil: component.asil || 'QM',
          safetyGoal: component.safetyGoal || '',
        };
        componentIds.push(componentId);
      });

      nodes[subsystemId] = {
        id: subsystemId,
        name: subsystem.name || 'Unnamed Subsystem',
        type: 'Subsystem',
        parentId: systemId,
        childIds: componentIds,
        asil: subsystem.asil || 'QM',
        safetyGoal: subsystem.safetyGoal || '',
      };
      subsystemIds.push(subsystemId);
    });

    nodes[systemId] = {
      id: systemId,
      name: system.name || 'Unnamed System',
      type: 'System',
      parentId: null,
      childIds: subsystemIds,
      asil: system.asil || 'QM',
      safetyGoal: system.safetyGoal || '',
    };
  });

  return nodes;
}

/**
 * Checks if the provided data is in the legacy nested format.
 *
 * @param data Any data to check
 * @returns True if it appears to be legacy FmedaComponent[]
 */
export function isLegacyFormat(data: unknown): data is FmedaComponent[] {
  if (!Array.isArray(data)) return false;
  if (data.length === 0) return false;

  // Check if the first element looks like a component with functions
  const first = data[0];
  return (
    typeof first === 'object' &&
    first !== null &&
    'name' in first &&
    'functions' in first &&
    Array.isArray(first.functions)
  );
}
