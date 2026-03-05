import { FmedaNode } from '../types/fmeda';

/**
 * Result of a quantitative FMEDA calculation for a node.
 */
export interface NodeTotals {
  totalFit: number;
  safeFit: number;
  dangerousFit: number;
  detectedFit: number;
  avgDc: number;
}

/**
 * Recursively calculates totals for a node and its descendants.
 * 
 * Logic for leaf nodes (FailureMode):
 * - If classification is 'Safe': 
 *    - totalFit = fitRate
 *    - safeFit = fitRate
 *    - dangerousFit = 0
 *    - detectedFit = 0
 *    - avgDc = 1.0 (100% safe)
 * - If classification is 'Dangerous': 
 *    - totalFit = fitRate
 *    - dangerousFit = fitRate
 *    - detectedFit = fitRate * DC
 *    - safeFit = detectedFit
 *    - avgDc = DC
 * 
 * Logic for parent nodes:
 * - totalFit = sum of children totalFit
 * - safeFit = sum of children safeFit
 * - dangerousFit = sum of children dangerousFit
 * - detectedFit = sum of children detectedFit
 * - avgDc = dangerousFit > 0 ? detectedFit / dangerousFit : 1.0
 * 
 * @param nodes The full record of nodes
 * @param nodeId The ID of the node to calculate totals for
 * @param updatedNodes A record to accumulate updated nodes with their new totals
 * @returns The calculated totals for the node
 */
export function calculateNodeTotals(
  nodes: Record<string, FmedaNode>,
  nodeId: string,
  updatedNodes: Record<string, FmedaNode> = {}
): NodeTotals {
  const node = nodes[nodeId];
  if (!node) return { totalFit: 0, safeFit: 0, dangerousFit: 0, detectedFit: 0, avgDc: 0 };

  let totals: NodeTotals;

  if (node.type === 'FailureMode') {
    const fitRate = node.fitRate || 0;
    const dc = node.diagnosticCoverage || 0;
    
    if (node.classification === 'Safe') {
      totals = {
        totalFit: fitRate,
        safeFit: fitRate,
        dangerousFit: 0,
        detectedFit: 0,
        avgDc: 1.0,
      };
    } else {
      const detectedFit = fitRate * dc;
      totals = {
        totalFit: fitRate,
        safeFit: detectedFit,
        dangerousFit: fitRate,
        detectedFit: detectedFit,
        avgDc: dc,
      };
    }
  } else {
    let totalFit = 0;
    let safeFit = 0;
    let dangerousFit = 0;
    let detectedFit = 0;

    for (const childId of node.childIds) {
      const childTotals = calculateNodeTotals(nodes, childId, updatedNodes);
      totalFit += childTotals.totalFit;
      safeFit += childTotals.safeFit;
      dangerousFit += childTotals.dangerousFit;
      detectedFit += childTotals.detectedFit;
    }

    const avgDc = dangerousFit > 0 ? detectedFit / dangerousFit : 1.0;

    totals = {
      totalFit,
      safeFit,
      dangerousFit,
      detectedFit,
      avgDc,
    };
  }

  // Update the node with calculated totals in the accumulator
  updatedNodes[nodeId] = {
    ...node,
    ...totals,
  };

  return totals;
}

/**
 * Recalculates totals for all nodes in the hierarchy, starting from roots.
 * 
 * @param nodes The current record of nodes
 * @returns A new record of nodes with updated totals
 */
export function recalculateAllTotals(nodes: Record<string, FmedaNode>): Record<string, FmedaNode> {
  const updatedNodes: Record<string, FmedaNode> = { ...nodes };
  const rootNodes = Object.values(nodes).filter((node) => !node.parentId);

  for (const root of rootNodes) {
    calculateNodeTotals(nodes, root.id, updatedNodes);
  }

  return updatedNodes;
}
