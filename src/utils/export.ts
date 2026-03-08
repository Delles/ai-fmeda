import { FmedaNode, ProjectContext } from '../types/fmeda';
import { isLegacyFormat, migrateLegacyToFlat } from './migration';

/**
 * Returns the exported file name with the project name if available.
 */
const getExportFileName = (projectName?: string) => {
  const dateStr = new Date().toISOString().split('T')[0];
  if (projectName) {
    const safeName = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return `fmeda-${safeName}-${dateStr}.json`;
  }
  return `fmeda-export-${dateStr}.json`;
};

/**
 * Exports the flat FMEDA data and project context to a JSON file.
 * Uses the File System Access API for a native "Save As" experience when available.
 */
export const exportToJson = async (nodes: FmedaNode[], projectContext: ProjectContext | null): Promise<{success: boolean, fileName?: string}> => {
  const exportData = {
    nodes,
    projectContext: projectContext || {},
  };

  const dataStr = JSON.stringify(exportData, null, 2);
  const exportFileDefaultName = getExportFileName(projectContext?.projectName);

  try {
    // Check if the File System Access API is supported
    if ('showSaveFilePicker' in window) {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: exportFileDefaultName,
        types: [
          {
            description: 'JSON File',
            accept: { 'application/json': ['.json'] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(dataStr);
      await writable.close();
      return { success: true, fileName: handle.name };
    }
  } catch (err: any) {
    // If the user aborted the save dialog, just return silently
    if (err.name !== 'AbortError') {
      console.error('File-system access API error:', err);
    }
    return { success: false };
  }

  // Fallback for browsers that do not support showSaveFilePicker
  const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

  const linkElement = document.createElement('a');
  linkElement.setAttribute('href', dataUri);
  linkElement.setAttribute('download', exportFileDefaultName);
  linkElement.click();

  return { success: true, fileName: exportFileDefaultName };
};

/**
 * Validates if an object matches the FmedaNode structure.
 */
const isFmedaNode = (obj: any): obj is FmedaNode => {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.type === 'string' &&
    (obj.parentId === null || typeof obj.parentId === 'string') &&
    Array.isArray(obj.childIds)
  );
};

export interface ImportResult {
  nodes: Record<string, FmedaNode>;
  projectContext: ProjectContext | null;
}

/**
 * Imports FMEDA data from a JSON file, supporting new flat with context, flat array, and legacy formats.
 */
export const importFromJson = (file: File): Promise<ImportResult> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);

        let projectContext: ProjectContext | null = null;
        let nodesData = json;

        // Check if it's the new format with nodes and projectContext
        if (!Array.isArray(json) && typeof json === 'object' && json !== null && 'nodes' in json) {
          nodesData = json.nodes;
          projectContext = json.projectContext || null;
        }

        if (!Array.isArray(nodesData)) {
          // Check if it's already a record (Record<string, FmedaNode>)
          if (typeof nodesData === 'object' && nodesData !== null) {
            const values = Object.values(nodesData);
            if (values.length > 0 && values.every(isFmedaNode)) {
              return resolve({ nodes: nodesData as Record<string, FmedaNode>, projectContext });
            }
          }
          return reject(new Error('Invalid file format: Expected an array or a valid nodes record.'));
        }

        if (nodesData.length === 0) {
          return resolve({ nodes: {}, projectContext });
        }

        // Check if it's the new flat format (array of nodes)
        if (nodesData.every(isFmedaNode)) {
          const nodesRecord: Record<string, FmedaNode> = {};
          nodesData.forEach((node: FmedaNode) => {
            nodesRecord[node.id] = node;
          });
          return resolve({ nodes: nodesRecord, projectContext });
        }

        // Check if it's the legacy nested format
        if (isLegacyFormat(nodesData)) {
          return resolve({ nodes: migrateLegacyToFlat(nodesData), projectContext });
        }

        reject(new Error('Invalid FMEDA data format: The file does not match the expected flat or legacy structure.'));
      } catch (error) {
        reject(new Error('Failed to parse JSON file.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsText(file);
  });
};
