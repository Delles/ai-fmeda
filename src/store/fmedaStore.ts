import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { FmedaNode, ProjectContext } from '../types/fmeda';
import { ProjectDocument } from '../types/document';
import { recalculateAffectedTotals, recalculateAllTotals } from '../utils/calculations';
import { isFmedaProfilingEnabled, logFmedaProfile } from '../utils/devProfiling';
import { normalizeProjectContext } from '../utils/projectDocuments';

/**
 * State and actions for managing the normalized flat FMEDA data structure.
 */
export interface FmedaState {
  /** Flat map of all nodes in the FMEDA hierarchy indexed by ID */
  nodes: Record<string, FmedaNode>;

  /** Optional context about the project parsed from the AI wizard */
  projectContext: ProjectContext | null;

  /** The ID of the currently selected node for editing */
  selectedId: string | null;

  /** Sets the entire nodes map (useful for migration and imports) */
  setNodes: (nodes: Record<string, FmedaNode>) => void;

  /** Sets the project context */
  setProjectContext: (context: ProjectContext | null) => void;

  /** Replaces the persisted project documents */
  setProjectDocuments: (documents: ProjectDocument[]) => void;

  /** Adds a project document to the persisted context */
  addProjectDocument: (document: ProjectDocument) => void;

  /** Removes a project document from the persisted context */
  removeProjectDocument: (id: string) => void;

  /** Sets the currently selected node ID */
  setSelectedId: (id: string | null) => void;

  /** Adds a new node to the system */
  addNode: (node: FmedaNode) => void;

  /** Updates an existing node's properties */
  updateNode: (id: string, updates: Partial<FmedaNode>) => void;

  /** Deletes a node and all its descendants */
  deleteNode: (id: string) => void;

  /** Moves a node to a new parent */
  moveNode: (id: string, newParentId: string | null) => void;

  /** Recalculates all totals in the hierarchy */
  recalculateTotals: () => void;
}

export interface HomeSummary {
  hasProject: boolean;
  componentCount: number;
  functionCount: number;
  failureModeCount: number;
  projectContext: ProjectContext | null;
}

/**
 * Helper to recursively collect all descendant IDs of a node.
 */
const getAllDescendantIds = (nodes: Record<string, FmedaNode>, id: string): string[] => {
  const descendants: string[] = [];

  const traverse = (currentId: string) => {
    const node = nodes[currentId];
    if (!node) return;

    for (const childId of node.childIds) {
      descendants.push(childId);
      traverse(childId);
    }
  };

  traverse(id);
  return descendants;
};

const areIdsEqual = (left: string[], right: string[]): boolean =>
  left.length === right.length && left.every((id, index) => id === right[index]);

const EMPTY_NODE_IDS: string[] = [];
const EMPTY_PATH_NODES: FmedaNode[] = [];
const EMPTY_VISIBLE_NODES: FmedaNode[] = [];
const EMPTY_VISIBLE_MAP: Record<string, FmedaNode> = {};

const collectSubtreeNodeIds = (nodes: Record<string, FmedaNode>, id: string): string[] => {
  const subtreeIds: string[] = [];

  const traverse = (currentId: string) => {
    const node = nodes[currentId];
    if (!node) return;

    subtreeIds.push(currentId);
    node.childIds.forEach(traverse);
  };

  traverse(id);
  return subtreeIds;
};

const collectSelectedPath = (nodes: Record<string, FmedaNode>, selectedId: string | null): FmedaNode[] => {
  if (!selectedId) return [];

  const path: FmedaNode[] = [];
  let current: FmedaNode | null = nodes[selectedId] ?? null;

  while (current) {
    path.unshift(current);
    current = current.parentId ? (nodes[current.parentId] ?? null) : null;
  }

  return path;
};

const profileStoreMutation = <T>(
  label: string,
  details: Record<string, unknown>,
  fn: () => T
): T => {
  if (!isFmedaProfilingEnabled()) {
    return fn();
  }

  const start = performance.now();
  const result = fn();
  logFmedaProfile('store', label, {
    durationMs: Number((performance.now() - start).toFixed(2)),
    ...details,
  });

  return result;
};

/**
 * Zustand store for FMEDA data management using a flat structure.
 * Replaces the previous nested component-based structure.
 */
export const useFmedaStore = create<FmedaState>()(
  persist(
    (set) => ({
      nodes: {},
      projectContext: null,
      selectedId: null,

      setNodes: (nodes) =>
        set(() =>
          profileStoreMutation(
            'setNodes',
            { nodeCount: Object.keys(nodes).length },
            () => ({ nodes: recalculateAllTotals(nodes) })
          )
        ),

      setProjectContext: (context) => set({ projectContext: normalizeProjectContext(context) }),

      setProjectDocuments: (documents) =>
        set((state) => ({
          projectContext: normalizeProjectContext({
            ...(state.projectContext ?? {}),
            documents,
          }),
        })),

      addProjectDocument: (document) =>
        set((state) => ({
          projectContext: normalizeProjectContext({
            ...(state.projectContext ?? {}),
            documents: [...(state.projectContext?.documents ?? []), document],
          }),
        })),

      removeProjectDocument: (id) =>
        set((state) => ({
          projectContext: normalizeProjectContext({
            ...(state.projectContext ?? {}),
            documents: (state.projectContext?.documents ?? []).filter((document) => document.id !== id),
          }),
        })),

      setSelectedId: (id) => set({ selectedId: id }),

      addNode: (node) =>
        set((state) =>
          profileStoreMutation(
            'addNode',
            { nodeId: node.id, parentId: node.parentId },
            () => {
              const newNodes = { ...state.nodes, [node.id]: node };

              if (node.parentId && newNodes[node.parentId]) {
                newNodes[node.parentId] = {
                  ...newNodes[node.parentId],
                  childIds: [...newNodes[node.parentId].childIds, node.id],
                };
              }

              return { nodes: recalculateAffectedTotals(newNodes, [node.id]) };
            }
          )
        ),

      updateNode: (id, updates) =>
        set((state) =>
          profileStoreMutation(
            'updateNode',
            { nodeId: id, updatedFields: Object.keys(updates) },
            () => {
              if (!state.nodes[id]) return state;

              const newNodes = {
                ...state.nodes,
                [id]: { ...state.nodes[id], ...updates },
              };

              return { nodes: recalculateAffectedTotals(newNodes, [id]) };
            }
          )
        ),

      deleteNode: (id) =>
        set((state) =>
          profileStoreMutation(
            'deleteNode',
            { nodeId: id },
            () => {
              const nodeToDelete = state.nodes[id];
              if (!nodeToDelete) return state;

              const descendantIds = getAllDescendantIds(state.nodes, id);
              const idsToRemove = [id, ...descendantIds];

              const newNodes = { ...state.nodes };

              if (nodeToDelete.parentId && newNodes[nodeToDelete.parentId]) {
                newNodes[nodeToDelete.parentId] = {
                  ...newNodes[nodeToDelete.parentId],
                  childIds: newNodes[nodeToDelete.parentId].childIds.filter((cid) => cid !== id),
                };
              }

              idsToRemove.forEach((removeId) => {
                delete newNodes[removeId];
              });

              return nodeToDelete.parentId
                ? { nodes: recalculateAffectedTotals(newNodes, [nodeToDelete.parentId]) }
                : { nodes: newNodes };
            }
          )
        ),

      moveNode: (id, newParentId) =>
        set((state) =>
          profileStoreMutation(
            'moveNode',
            { nodeId: id, newParentId },
            () => {
              const node = state.nodes[id];
              if (!node || node.parentId === newParentId) return state;

              const newNodes = { ...state.nodes };

              if (node.parentId && newNodes[node.parentId]) {
                newNodes[node.parentId] = {
                  ...newNodes[node.parentId],
                  childIds: newNodes[node.parentId].childIds.filter((cid) => cid !== id),
                };
              }

              newNodes[id] = { ...node, parentId: newParentId };

              if (newParentId && newNodes[newParentId]) {
                newNodes[newParentId] = {
                  ...newNodes[newParentId],
                  childIds: [...newNodes[newParentId].childIds, id],
                };
              }

              return {
                nodes: recalculateAffectedTotals(newNodes, [node.parentId, newParentId]),
              };
            }
          )
        ),

      recalculateTotals: () =>
        set((state) =>
          profileStoreMutation(
            'recalculateTotals',
            { nodeCount: Object.keys(state.nodes).length },
            () => ({
              nodes: recalculateAllTotals(state.nodes),
            })
          )
        ),
    }),
    {
      name: 'fmeda-storage',
      version: 2,
      migrate: (persistedState) => {
        const state = (persistedState ?? {}) as Partial<FmedaState>;
        return {
          ...state,
          projectContext: normalizeProjectContext(state.projectContext),
        };
      },
    }
  )
);

export const selectNodeCount = (state: FmedaState) => Object.keys(state.nodes).length;

export const selectHomeSummary = (() => {
  let previousSummary: HomeSummary | null = null;

  return (state: FmedaState): HomeSummary => {
    let componentCount = 0;
    let functionCount = 0;
    let failureModeCount = 0;

    for (const node of Object.values(state.nodes)) {
      if (node.type === 'Component') componentCount += 1;
      if (node.type === 'Function') functionCount += 1;
      if (node.type === 'FailureMode') failureModeCount += 1;
    }

    const hasProject = componentCount + functionCount + failureModeCount > 0 || Object.keys(state.nodes).length > 0;

    if (
      previousSummary &&
      previousSummary.hasProject === hasProject &&
      previousSummary.componentCount === componentCount &&
      previousSummary.functionCount === functionCount &&
      previousSummary.failureModeCount === failureModeCount &&
      previousSummary.projectContext === state.projectContext
    ) {
      return previousSummary;
    }

    previousSummary = {
      hasProject,
      componentCount,
      functionCount,
      failureModeCount,
      projectContext: state.projectContext,
    };

    return previousSummary;
  };
})();

export const selectRootNodeIds = (() => {
  let previousRootIds = EMPTY_NODE_IDS;

  return (state: FmedaState): string[] => {
    const nextRootIds = Object.values(state.nodes)
      .filter((node) => !node.parentId)
      .map((node) => node.id);

    if (areIdsEqual(previousRootIds, nextRootIds)) {
      return previousRootIds;
    }

    previousRootIds = nextRootIds;
    return previousRootIds;
  };
})();

export const selectProjectDocuments = (() => {
  const emptyDocuments: ProjectDocument[] = [];
  let previousProjectContext: ProjectContext | null | undefined;
  let previousDocuments: ProjectDocument[] = emptyDocuments;

  return (state: FmedaState): ProjectDocument[] => {
    const projectContext = state.projectContext;
    if (projectContext === previousProjectContext) {
      return previousDocuments;
    }

    previousProjectContext = projectContext;
    previousDocuments = projectContext?.documents ?? emptyDocuments;
    return previousDocuments;
  };
})();

export const selectSelectedPath = (() => {
  let previousSelectedId: string | null = null;
  let previousPathIds = EMPTY_NODE_IDS;
  let previousPathNodes = EMPTY_PATH_NODES;

  return (state: FmedaState): FmedaNode[] => {
    if (!state.selectedId) {
      previousSelectedId = null;
      previousPathIds = EMPTY_NODE_IDS;
      previousPathNodes = EMPTY_PATH_NODES;
      return previousPathNodes;
    }

    const nextPathNodes = collectSelectedPath(state.nodes, state.selectedId);
    const nextPathIds = nextPathNodes.map((node) => node.id);
    const samePath =
      previousSelectedId === state.selectedId &&
      areIdsEqual(previousPathIds, nextPathIds) &&
      nextPathNodes.every((node, index) => previousPathNodes[index] === node);

    if (samePath) {
      return previousPathNodes;
    }

    previousSelectedId = state.selectedId;
    previousPathIds = nextPathIds;
    previousPathNodes = nextPathNodes;
    return previousPathNodes;
  };
})();

export const selectVisibleNodes = (() => {
  let previousSelectedId: string | null = null;
  let previousVisibleIds = EMPTY_NODE_IDS;
  let previousVisibleNodes = EMPTY_VISIBLE_NODES;
  let previousVisibleMap = EMPTY_VISIBLE_MAP;

  return (state: FmedaState): Record<string, FmedaNode> => {
    if (!state.selectedId) {
      previousSelectedId = null;
      previousVisibleIds = EMPTY_NODE_IDS;
      previousVisibleNodes = EMPTY_VISIBLE_NODES;
      previousVisibleMap = EMPTY_VISIBLE_MAP;
      return state.nodes;
    }

    const selectedNode = state.nodes[state.selectedId];
    if (!selectedNode) {
      previousSelectedId = state.selectedId;
      previousVisibleIds = EMPTY_NODE_IDS;
      previousVisibleNodes = EMPTY_VISIBLE_NODES;
      previousVisibleMap = EMPTY_VISIBLE_MAP;
      return previousVisibleMap;
    }

    const nextVisibleIds = collectSubtreeNodeIds(state.nodes, state.selectedId);
    const sameVisibleNodes =
      previousSelectedId === state.selectedId &&
      areIdsEqual(previousVisibleIds, nextVisibleIds) &&
      nextVisibleIds.every((id, index) => previousVisibleNodes[index] === state.nodes[id]);

    if (sameVisibleNodes) {
      return previousVisibleMap;
    }

    const nextVisibleMap: Record<string, FmedaNode> = {};
    nextVisibleIds.forEach((id) => {
      const node = state.nodes[id];
      if (node) {
        nextVisibleMap[id] = node;
      }
    });

    previousSelectedId = state.selectedId;
    previousVisibleIds = nextVisibleIds;
    previousVisibleNodes = nextVisibleIds.map((id) => state.nodes[id]);
    previousVisibleMap = nextVisibleMap;

    return previousVisibleMap;
  };
})();
