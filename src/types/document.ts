export interface ProjectDocument {
  id: string;
  name: string;
  extractedText: string;
  uploadedAt: string;
  kind?: 'uploaded' | 'notes';
}

export type Document = ProjectDocument;
