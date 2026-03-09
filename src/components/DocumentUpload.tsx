import React, { useMemo, useRef, useState } from 'react';
import {
  Upload,
  FileText,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  StickyNote,
} from 'lucide-react';
import { selectProjectDocuments, useFmedaStore } from '../store/fmedaStore';
import { extractTextFromFile } from '../utils/documentParser';
import { cn } from '../lib/utils';
import { generateId } from '../utils/id';
import {
  getProjectNotesText,
  isProjectNotesDocument,
  upsertProjectNotesDocument,
} from '../utils/projectDocuments';

const formatUploadedAt = (timestamp: string): string => {
  const value = new Date(timestamp);
  if (Number.isNaN(value.getTime())) {
    return 'Saved locally';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(value);
};

export const DocumentUpload: React.FC = () => {
  const documents = useFmedaStore(selectProjectDocuments);
  const addProjectDocument = useFmedaStore((state) => state.addProjectDocument);
  const setProjectDocuments = useFmedaStore((state) => state.setProjectDocuments);
  const removeProjectDocument = useFmedaStore((state) => state.removeProjectDocument);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectNotesText = useMemo(() => getProjectNotesText(documents), [documents]);
  const uploadedDocuments = useMemo(
    () => documents.filter((document) => !isProjectNotesDocument(document)),
    [documents]
  );

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsParsing(true);
    setError(null);
    setIsExpanded(true);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const extractedText = await extractTextFromFile(file);
        addProjectDocument({
          id: generateId(),
          name: file.name,
          extractedText,
          uploadedAt: new Date().toISOString(),
          kind: 'uploaded',
        });
      } catch (err) {
        console.error(`Error parsing document ${file.name}:`, err);
        setError(
          (prev) =>
            (prev ? `${prev}\n` : '') +
            `Failed to parse ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
      }
    }

    setIsParsing(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const triggerFileInput = (e: React.MouseEvent) => {
    e.stopPropagation();
    fileInputRef.current?.click();
  };

  const docCount = documents.length;
  const uploadedCount = uploadedDocuments.length;
  const hasNotes = projectNotesText.trim().length > 0;
  const handleNotesChange = (value: string) => {
    setProjectDocuments(upsertProjectNotesDocument(documents, value));
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={triggerFileInput}
          disabled={isParsing}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-md hover:bg-gray-50 hover:border-gray-300 transition-colors text-sm font-medium shadow-sm',
            isParsing && 'opacity-70 cursor-not-allowed'
          )}
          title="Upload PDF or TXT reference documents"
        >
          {isParsing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
          ) : (
            <Upload className="w-3.5 h-3.5 text-blue-500" />
          )}
          {isParsing ? 'Parsing…' : 'Upload Doc'}
        </button>

        {docCount > 0 && (
          <button
            type="button"
            onClick={() => setIsExpanded((v) => !v)}
            className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors border border-blue-100"
            title={isExpanded ? 'Hide project documents' : 'Show project documents'}
          >
            <FileText className="w-3 h-3" />
            {uploadedCount} file{uploadedCount !== 1 ? 's' : ''}
            {hasNotes ? ' + notes' : ''}
            {isExpanded ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>
        )}

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".pdf,.txt"
          multiple
          className="hidden"
        />
      </div>

      {isExpanded && docCount > 0 && (
        <div className="absolute top-full left-0 mt-1 z-50 w-80 bg-white rounded-lg border border-gray-200 shadow-lg overflow-hidden">
          <div className="px-3 py-3 border-b border-gray-100 bg-gray-50/70">
            <p className="text-xs font-semibold text-gray-700">Project document context</p>
            <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
              Notes and uploaded files are shared with the wizard and stay available after refresh.
            </p>
          </div>
          {error && (
            <div className="px-3 py-2 bg-red-50 border-b border-red-100 flex items-start gap-2 text-red-700 text-xs whitespace-pre-line">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div className="max-h-[28rem] overflow-y-auto">
            <div className="px-3 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-2">
                <StickyNote className="w-3.5 h-3.5 text-amber-500" />
                Project notes
              </div>
              <textarea
                value={projectNotesText}
                onChange={(event) => handleNotesChange(event.target.value)}
                placeholder="Add system notes, assumptions, or architecture context for AI suggestions..."
                className="w-full min-h-[96px] resize-y rounded-md border border-gray-200 px-3 py-2 text-xs leading-relaxed text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              <div className="mt-2 flex items-center justify-between text-[10px] text-gray-400">
                <span>Editable here or in the project wizard.</span>
                <span>{projectNotesText.trim().length.toLocaleString()} chars</span>
              </div>
            </div>

            <div className="px-3 py-2 border-b border-gray-100">
              <div className="flex items-center justify-between text-[11px] text-gray-500">
                <span>{uploadedCount} uploaded reference file{uploadedCount !== 1 ? 's' : ''}</span>
                <span>{docCount} total source{docCount !== 1 ? 's' : ''}</span>
              </div>
            </div>

            {uploadedCount === 0 ? (
              <div className="px-3 py-4 text-xs text-gray-500">
                Upload PDF or TXT files here to keep datasheets and specs attached to this project.
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {uploadedDocuments.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-start justify-between gap-3 px-3 py-2 hover:bg-gray-50"
                  >
                    <div className="flex items-start gap-2 overflow-hidden">
                      <div className="bg-blue-50 p-1.5 rounded text-blue-600 flex-shrink-0">
                        <FileText className="w-3.5 h-3.5" />
                      </div>
                      <div className="overflow-hidden">
                        <p className="text-xs font-medium text-gray-700 truncate" title={doc.name}>
                          {doc.name}
                        </p>
                        <p className="mt-0.5 text-[10px] text-gray-400 flex items-center gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5 text-green-500 flex-shrink-0" />
                          {doc.extractedText.length.toLocaleString()} chars
                          <span className="text-gray-300">•</span>
                          {formatUploadedAt(doc.uploadedAt)}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeProjectDocument(doc.id)}
                      className={cn(
                        'p-1 rounded transition-colors text-gray-400 hover:text-red-600 hover:bg-red-50'
                      )}
                      title="Remove document"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
