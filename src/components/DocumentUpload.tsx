import React, { useState, useRef } from 'react';
import { Upload, FileText, Trash2, Loader2, CheckCircle2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useDocumentStore } from '../store/documentStore';
import { extractTextFromFile } from '../utils/documentParser';
import { cn } from '../lib/utils';
import { generateId } from '../utils/id';

export const DocumentUpload: React.FC = () => {
  const { documents, addDocument, removeDocument } = useDocumentStore();
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        addDocument({
          id: generateId(),
          name: file.name,
          extractedText,
          uploadedAt: new Date().toISOString(),
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

  return (
    <div className="relative">
      {/* Compact toolbar row */}
      <div className="flex items-center gap-2">
        <button
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
            onClick={() => setIsExpanded((v) => !v)}
            className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors border border-blue-100"
            title={isExpanded ? 'Hide documents' : 'Show uploaded documents'}
          >
            <FileText className="w-3 h-3" />
            {docCount} doc{docCount !== 1 ? 's' : ''}
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

      {/* Expandable document list — floats as a dropdown */}
      {isExpanded && docCount > 0 && (
        <div className="absolute top-full left-0 mt-1 z-50 w-80 bg-white rounded-lg border border-gray-200 shadow-lg overflow-hidden">
          {error && (
            <div className="px-3 py-2 bg-red-50 border-b border-red-100 flex items-start gap-2 text-red-700 text-xs">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div className="max-h-56 overflow-y-auto divide-y divide-gray-100">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 group"
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <div className="bg-blue-50 p-1.5 rounded text-blue-600 flex-shrink-0">
                    <FileText className="w-3.5 h-3.5" />
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-xs font-medium text-gray-700 truncate" title={doc.name}>
                      {doc.name}
                    </p>
                    <p className="text-[10px] text-gray-400 flex items-center gap-1">
                      <CheckCircle2 className="w-2.5 h-2.5 text-green-500 flex-shrink-0" />
                      {doc.extractedText.length.toLocaleString()} chars
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => removeDocument(doc.id)}
                  className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                  title="Remove document"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
