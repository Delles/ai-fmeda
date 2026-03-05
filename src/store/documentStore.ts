import { create } from 'zustand';
import { Document } from '../types/document';

export interface DocumentState {
  documents: Document[];
  addDocument: (document: Document) => void;
  removeDocument: (id: string) => void;
  clearDocuments: () => void;
}

export const useDocumentStore = create<DocumentState>((set) => ({
  documents: [],
  addDocument: (document) =>
    set((state) => ({
      documents: [...state.documents, document],
    })),
  removeDocument: (id) =>
    set((state) => ({
      documents: state.documents.filter((doc) => doc.id !== id),
    })),
  clearDocuments: () => set({ documents: [] }),
}));
