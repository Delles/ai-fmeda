import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { FmedaNode, ProjectContext } from '../types/fmeda';
import { recalculateAllTotals } from '../utils/calculations';

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

      setNodes: (nodes) => set({ nodes: recalculateAllTotals(nodes) }),

      setProjectContext: (context) => set({ projectContext: context }),

      setSelectedId: (id) => set({ selectedId: id }),

      addNode: (node) =>
        set((state) => {
          const newNodes = { ...state.nodes, [node.id]: node };

          // If the node has a parent, update the parent's childIds
          if (node.parentId && newNodes[node.parentId]) {
            newNodes[node.parentId] = {
              ...newNodes[node.parentId],
              childIds: [...newNodes[node.parentId].childIds, node.id],
            };
          }

          return { nodes: recalculateAllTotals(newNodes) };
        }),

      updateNode: (id, updates) =>
        set((state) => {
          if (!state.nodes[id]) return state;

          const newNodes = {
            ...state.nodes,
            [id]: { ...state.nodes[id], ...updates },
          };

          return { nodes: recalculateAllTotals(newNodes) };
        }),

      deleteNode: (id) =>
        set((state) => {
          const nodeToDelete = state.nodes[id];
          if (!nodeToDelete) return state;

          const descendantIds = getAllDescendantIds(state.nodes, id);
          const idsToRemove = [id, ...descendantIds];

          const newNodes = { ...state.nodes };

          // Remove from parent's childIds
          if (nodeToDelete.parentId && newNodes[nodeToDelete.parentId]) {
            newNodes[nodeToDelete.parentId] = {
              ...newNodes[nodeToDelete.parentId],
              childIds: newNodes[nodeToDelete.parentId].childIds.filter((cid) => cid !== id),
            };
          }

          // Delete the node and all descendants
          idsToRemove.forEach((removeId) => {
            delete newNodes[removeId];
          });

          return { nodes: recalculateAllTotals(newNodes) };
        }),

      moveNode: (id, newParentId) =>
        set((state) => {
          const node = state.nodes[id];
          if (!node || node.parentId === newParentId) return state;

          const newNodes = { ...state.nodes };

          // Remove from old parent's childIds
          if (node.parentId && newNodes[node.parentId]) {
            newNodes[node.parentId] = {
              ...newNodes[node.parentId],
              childIds: newNodes[node.parentId].childIds.filter((cid) => cid !== id),
            };
          }

          // Update node's parentId
          newNodes[id] = { ...node, parentId: newParentId };

          // Add to new parent's childIds
          if (newParentId && newNodes[newParentId]) {
            newNodes[newParentId] = {
              ...newNodes[newParentId],
              childIds: [...newNodes[newParentId].childIds, id],
            };
          }

          return { nodes: recalculateAllTotals(newNodes) };
        }),

      recalculateTotals: () =>
        set((state) => ({
          nodes: recalculateAllTotals(state.nodes),
        })),
    }),
    {
      name: 'fmeda-storage',
    }
  )
);

