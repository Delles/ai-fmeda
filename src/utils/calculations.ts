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

const EMPTY_TOTALS: NodeTotals = {
  totalFit: 0,
  safeFit: 0,
  dangerousFit: 0,
  detectedFit: 0,
  avgDc: 1.0,
};

const MISSING_NODE_TOTALS: NodeTotals = {
  totalFit: 0,
  safeFit: 0,
  dangerousFit: 0,
  detectedFit: 0,
  avgDc: 0,
};

const calculateFailureModeTotals = (node: FmedaNode): NodeTotals => {
  const fitRate = node.fitRate || 0;
  const dc = node.diagnosticCoverage || 0;

  if (node.classification === 'Safe') {
    return {
      totalFit: fitRate,
      safeFit: fitRate,
      dangerousFit: 0,
      detectedFit: 0,
      avgDc: 1.0,
    };
  }

  const detectedFit = fitRate * dc;

  return {
    totalFit: fitRate,
    safeFit: detectedFit,
    dangerousFit: fitRate,
    detectedFit,
    avgDc: dc,
  };
};

const getStoredNodeTotals = (node: FmedaNode): NodeTotals => ({
  totalFit: node.totalFit ?? 0,
  safeFit: node.safeFit ?? 0,
  dangerousFit: node.dangerousFit ?? 0,
  detectedFit: node.detectedFit ?? ((node.dangerousFit ?? 0) * (node.avgDc ?? 1.0)),
  avgDc: node.avgDc ?? ((node.dangerousFit ?? 0) > 0 ? 0 : 1.0),
});

const aggregateChildTotals = (
  node: FmedaNode,
  resolveChildTotals: (childId: string) => NodeTotals
): NodeTotals => {
  if (node.type === 'FailureMode') {
    return calculateFailureModeTotals(node);
  }

  if (node.childIds.length === 0) {
    return EMPTY_TOTALS;
  }

  let totalFit = 0;
  let safeFit = 0;
  let dangerousFit = 0;
  let detectedFit = 0;

  for (const childId of node.childIds) {
    const childTotals = resolveChildTotals(childId);
    totalFit += childTotals.totalFit;
    safeFit += childTotals.safeFit;
    dangerousFit += childTotals.dangerousFit;
    detectedFit += childTotals.detectedFit;
  }

  return {
    totalFit,
    safeFit,
    dangerousFit,
    detectedFit,
    avgDc: dangerousFit > 0 ? detectedFit / dangerousFit : 1.0,
  };
};

/**
 * Recursively calculates totals for a node and its descendants.
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
  if (!node) return MISSING_NODE_TOTALS;

  const totals = aggregateChildTotals(node, (childId) => calculateNodeTotals(nodes, childId, updatedNodes));

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

/**
 * Recalculates the changed node and walks upward through its ancestor chains.
 * Unaffected branches keep their existing object identity for cheaper updates.
 */
export function recalculateAffectedTotals(
  nodes: Record<string, FmedaNode>,
  affectedNodeIds: Array<string | null | undefined>
): Record<string, FmedaNode> {
  const validStartIds = affectedNodeIds.filter((id): id is string => Boolean(id && nodes[id]));

  if (validStartIds.length === 0) {
    return nodes;
  }

  const updatedNodes: Record<string, FmedaNode> = { ...nodes };

  for (const startId of validStartIds) {
    const visitedInChain = new Set<string>();
    let currentId: string | null = startId;

    while (currentId && !visitedInChain.has(currentId)) {
      visitedInChain.add(currentId);

      const currentNode: FmedaNode | undefined = updatedNodes[currentId];
      if (!currentNode) {
        break;
      }

      const totals = aggregateChildTotals(currentNode, (childId) => {
        const childNode: FmedaNode | undefined = updatedNodes[childId];

        if (!childNode) {
          return MISSING_NODE_TOTALS;
        }

        if (childNode.type === 'FailureMode') {
          return calculateFailureModeTotals(childNode);
        }

        return getStoredNodeTotals(childNode);
      });

      updatedNodes[currentId] = {
        ...currentNode,
        ...totals,
      };

      currentId = currentNode.parentId;
    }
  }

  return updatedNodes;
}
