import { describe, expect, it } from 'vitest';
import {
  PROJECT_NOTES_DOCUMENT_ID,
  getCombinedDocumentText,
  normalizeProjectContext,
  upsertProjectNotesDocument,
} from './projectDocuments';

describe('projectDocuments', () => {
  it('migrates legacy documentText into a notes document', () => {
    const context = normalizeProjectContext({
      projectName: 'Brake ECU',
      documentText: 'Legacy technical notes',
    });

    expect(context).not.toBeNull();
    expect(context?.documents).toEqual([
      expect.objectContaining({
        id: PROJECT_NOTES_DOCUMENT_ID,
        name: 'Project Notes',
        extractedText: 'Legacy technical notes',
        kind: 'notes',
      }),
    ]);
    expect(context?.documentText).toBe('Legacy technical notes');
  });

  it('builds combined AI context from notes and uploaded files', () => {
    const text = getCombinedDocumentText([
      {
        id: PROJECT_NOTES_DOCUMENT_ID,
        name: 'Project Notes',
        extractedText: 'System overview',
        uploadedAt: new Date(0).toISOString(),
        kind: 'notes',
      },
      {
        id: 'doc-1',
        name: 'sensor-spec.txt',
        extractedText: 'Sensor operating range',
        uploadedAt: new Date(0).toISOString(),
        kind: 'uploaded',
      },
    ]);

    expect(text).toBe('System overview\n\n--- Document: sensor-spec.txt ---\nSensor operating range');
  });

  it('replaces the notes document when pasted text changes', () => {
    const documents = upsertProjectNotesDocument(
      [
        {
          id: 'doc-1',
          name: 'reference.pdf',
          extractedText: 'Uploaded reference',
          uploadedAt: new Date(0).toISOString(),
          kind: 'uploaded',
        },
      ],
      'Updated notes'
    );

    expect(documents).toHaveLength(2);
    expect(documents[1]).toEqual(
      expect.objectContaining({
        id: PROJECT_NOTES_DOCUMENT_ID,
        extractedText: 'Updated notes',
        kind: 'notes',
      })
    );
  });
});
