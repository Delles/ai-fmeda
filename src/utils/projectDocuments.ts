import type { ProjectDocument } from '../types/document';
import type { ProjectContext } from '../types/fmeda';

export const PROJECT_NOTES_DOCUMENT_ID = 'project-notes';
export const PROJECT_NOTES_DOCUMENT_NAME = 'Project Notes';

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

export const isProjectNotesDocument = (document: ProjectDocument): boolean =>
  document.id === PROJECT_NOTES_DOCUMENT_ID || document.kind === 'notes';

export const createProjectNotesDocument = (
  extractedText: string,
  uploadedAt = new Date().toISOString()
): ProjectDocument => ({
  id: PROJECT_NOTES_DOCUMENT_ID,
  name: PROJECT_NOTES_DOCUMENT_NAME,
  extractedText,
  uploadedAt,
  kind: 'notes',
});

export const normalizeProjectDocuments = (value: unknown): ProjectDocument[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Partial<ProjectDocument> => Boolean(item) && typeof item === 'object')
    .map((item, index) => {
      const extractedText = typeof item.extractedText === 'string' ? item.extractedText : '';
      const kind = item.kind === 'notes' || item.id === PROJECT_NOTES_DOCUMENT_ID ? 'notes' : 'uploaded';
      return {
        id: isNonEmptyString(item.id)
          ? item.id
          : kind === 'notes'
            ? PROJECT_NOTES_DOCUMENT_ID
            : `document-${index + 1}`,
        name: isNonEmptyString(item.name)
          ? item.name
          : kind === 'notes'
            ? PROJECT_NOTES_DOCUMENT_NAME
            : `Document ${index + 1}`,
        extractedText,
        uploadedAt: isNonEmptyString(item.uploadedAt) ? item.uploadedAt : new Date(0).toISOString(),
        kind,
      } satisfies ProjectDocument;
    })
    .filter((document) => isProjectNotesDocument(document) || document.extractedText.trim().length > 0);
};

export const upsertProjectNotesDocument = (
  documents: ProjectDocument[],
  extractedText: string,
  uploadedAt = new Date().toISOString()
): ProjectDocument[] => {
  const withoutNotes = documents.filter((document) => !isProjectNotesDocument(document));

  if (!extractedText.trim()) {
    return withoutNotes;
  }

  return [...withoutNotes, createProjectNotesDocument(extractedText, uploadedAt)];
};

export const getProjectNotesText = (documents: ProjectDocument[]): string =>
  documents.find(isProjectNotesDocument)?.extractedText ?? '';

export const getCombinedDocumentText = (documents: ProjectDocument[]): string =>
  documents
    .map((document) => {
      const text = document.extractedText.trim();
      if (!text) return '';
      if (isProjectNotesDocument(document)) {
        return text;
      }

      return `--- Document: ${document.name} ---\n${text}`;
    })
    .filter(Boolean)
    .join('\n\n');

export const normalizeProjectContext = (value: unknown): ProjectContext | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as Partial<ProjectContext>;
  const projectName = typeof raw.projectName === 'string' ? raw.projectName : undefined;
  const safetyStandard = typeof raw.safetyStandard === 'string' ? raw.safetyStandard : undefined;
  const targetAsil = typeof raw.targetAsil === 'string' ? raw.targetAsil : undefined;
  const safetyGoal = typeof raw.safetyGoal === 'string' ? raw.safetyGoal : undefined;

  let documents = normalizeProjectDocuments(raw.documents);
  if (documents.length === 0 && typeof raw.documentText === 'string' && raw.documentText.trim()) {
    documents = [createProjectNotesDocument(raw.documentText)];
  }

  const documentText = getCombinedDocumentText(documents);

  const context: ProjectContext = {
    ...(projectName ? { projectName } : {}),
    ...(safetyStandard ? { safetyStandard } : {}),
    ...(targetAsil ? { targetAsil } : {}),
    ...(safetyGoal ? { safetyGoal } : {}),
    ...(documents.length > 0 ? { documents } : {}),
    ...(documentText ? { documentText } : {}),
  };

  return Object.keys(context).length > 0 ? context : null;
};
