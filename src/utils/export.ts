import { FmedaNode } from '../types/fmeda';
import { isLegacyFormat, migrateLegacyToFlat } from './migration';

/**
 * Exports the flat FMEDA data to a JSON file.
 */
export const exportToJson = (nodes: FmedaNode[]) => {
  const dataStr = JSON.stringify(nodes, null, 2);
  const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

  const exportFileDefaultName = `fmeda-export-${new Date().toISOString().split('T')[0]}.json`;

  const linkElement = document.createElement('a');
  linkElement.setAttribute('href', dataUri);
  linkElement.setAttribute('download', exportFileDefaultName);
  linkElement.click();
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

/**
 * Imports FMEDA data from a JSON file, supporting both new flat and legacy nested formats.
 */
export const importFromJson = (file: File): Promise<Record<string, FmedaNode>> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        
        if (!Array.isArray(json)) {
          // Check if it's already a record (Record<string, FmedaNode>)
          if (typeof json === 'object' && json !== null) {
            const values = Object.values(json);
            if (values.length > 0 && values.every(isFmedaNode)) {
              return resolve(json as Record<string, FmedaNode>);
            }
          }
          return reject(new Error('Invalid file format: Expected an array or a valid nodes record.'));
        }

        if (json.length === 0) {
          return resolve({});
        }

        // Check if it's the new flat format (array of nodes)
        if (json.every(isFmedaNode)) {
          const nodesRecord: Record<string, FmedaNode> = {};
          json.forEach(node => {
            nodesRecord[node.id] = node;
          });
          return resolve(nodesRecord);
        }

        // Check if it's the legacy nested format
        if (isLegacyFormat(json)) {
          return resolve(migrateLegacyToFlat(json));
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
