import React, { useRef, useState } from 'react';
import { Upload, Loader2, FileText, Sparkles, ChevronRight, Trash2, StickyNote } from 'lucide-react';
import { extractTextFromFile } from '@/utils/documentParser';
import type { ProjectDocument } from '@/types/document';
import { generateId } from '@/utils/id';
import {
  getCombinedDocumentText,
  getProjectNotesText,
  upsertProjectNotesDocument,
} from '@/utils/projectDocuments';

const SAFETY_STANDARDS = [
  { value: '', label: 'Select standard...' },
  { value: 'ISO 26262', label: 'ISO 26262 — Road Vehicles' },
  { value: 'IEC 61508', label: 'IEC 61508 — General E/E/PE' },
  { value: 'ISO 13849', label: 'ISO 13849 — Machinery Safety' },
  { value: 'IEC 62443', label: 'IEC 62443 — Industrial Cybersecurity' },
  { value: 'DO-178C', label: 'DO-178C — Airborne Software' },
  { value: 'Custom', label: 'Custom / Other' },
];

const ASIL_LEVELS = ['', 'QM', 'ASIL A', 'ASIL B', 'ASIL C', 'ASIL D'];

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

interface StepProjectSetupProps {
  projectName: string;
  safetyStandard: string;
  targetAsil: string;
  safetyGoal: string;
  documents: ProjectDocument[];
  onUpdate: (updates: Partial<{
    projectName: string;
    safetyStandard: string;
    targetAsil: string;
    safetyGoal: string;
    documents: ProjectDocument[];
  }>) => void;
  onNext: () => void;
}

export const StepProjectSetup: React.FC<StepProjectSetupProps> = ({
  projectName,
  safetyStandard,
  targetAsil,
  safetyGoal,
  documents,
  onUpdate,
  onNext,
}) => {
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const documentText = getProjectNotesText(documents);
  const uploadedFiles = documents.filter((document) => document.kind !== 'notes');
  const removeUploadedFile = (id: string) => {
    onUpdate({ documents: documents.filter((document) => document.id !== id) });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsParsing(true);
    setParseError(null);

    try {
      const nextDocuments = [...documents];
      for (let i = 0; i < files.length; i++) {
        const text = await extractTextFromFile(files[i]);
        nextDocuments.push({
          id: generateId(),
          name: files[i].name,
          extractedText: text,
          uploadedAt: new Date().toISOString(),
          kind: 'uploaded',
        });
      }
      onUpdate({ documents: nextDocuments });
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed to parse document');
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const canProceed = projectName.trim().length > 0 && getCombinedDocumentText(documents).trim().length > 0;
  const totalDocumentCount = documents.length;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Project Name */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">
          Project Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={projectName}
          onChange={(e) => onUpdate({ projectName: e.target.value })}
          placeholder="e.g., ADAS FMEDA Analysis — Brake System"
          className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-shadow"
        />
      </div>

      {/* Standard + ASIL row */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">
            Safety Standard
          </label>
          <select
            value={safetyStandard}
            onChange={(e) => onUpdate({ safetyStandard: e.target.value })}
            className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white transition-shadow"
          >
            {SAFETY_STANDARDS.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">
            Target ASIL
          </label>
          <select
            value={targetAsil}
            onChange={(e) => onUpdate({ targetAsil: e.target.value })}
            className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white transition-shadow"
          >
            {ASIL_LEVELS.map(level => (
              <option key={level} value={level}>{level || 'Select ASIL...'}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Safety Goal */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">
          Safety Goal
        </label>
        <input
          type="text"
          value={safetyGoal}
          onChange={(e) => onUpdate({ safetyGoal: e.target.value })}
          placeholder="e.g., Prevent unintended acceleration under all operating conditions"
          className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-shadow"
        />
        <p className="text-xs text-slate-400 mt-1">Helps the AI generate more relevant components and failure modes.</p>
      </div>

      {/* Separator */}
      <div className="border-t border-slate-200 pt-4">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-blue-600" />
          <label className="text-sm font-semibold text-slate-700">
            Technical Documentation <span className="text-red-500">*</span>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-3 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-700 border border-blue-100">
            <StickyNote className="w-3 h-3" />
            {documentText.trim().length.toLocaleString()} note chars
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600 border border-slate-200">
            <FileText className="w-3 h-3" />
            {uploadedFiles.length} uploaded file{uploadedFiles.length !== 1 ? 's' : ''}
          </span>
          <span className="text-slate-400">
            Everything here carries into analysis as one shared project context.
          </span>
        </div>
        
        <textarea
          value={documentText}
          onChange={(e) => onUpdate({ documents: upsertProjectNotesDocument(documents, e.target.value) })}
          placeholder="Paste technical specifications, architecture descriptions, datasheets, or component lists here..."
          className="w-full h-52 p-4 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-sm transition-shadow font-mono leading-relaxed"
        />

        {/* Upload area */}
        <div className="flex items-center gap-4 mt-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isParsing}
            className="flex items-center gap-2 px-4 py-2 border border-dashed border-slate-300 rounded-lg hover:bg-slate-50 hover:border-slate-400 transition-all text-sm font-medium text-slate-600"
          >
            {isParsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {isParsing ? 'Parsing...' : 'Upload PDF / TXT'}
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".pdf,.txt"
            multiple
            className="hidden"
          />
          {uploadedFiles.length > 0 && (
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <FileText className="w-3 h-3" />
              {uploadedFiles.length} file{uploadedFiles.length > 1 ? 's' : ''} uploaded
            </div>
          )}
        </div>

        {uploadedFiles.length > 0 && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <div>
                <p className="text-sm font-semibold text-slate-700">Attached reference files</p>
                <p className="text-xs text-slate-500">
                  {totalDocumentCount} project source{totalDocumentCount !== 1 ? 's' : ''} saved in this draft.
                </p>
              </div>
            </div>
            <div className="divide-y divide-slate-200">
              {uploadedFiles.map((file) => (
                <div key={file.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate" title={file.name}>
                      {file.name}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {file.extractedText.length.toLocaleString()} chars extracted • {formatUploadedAt(file.uploadedAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeUploadedFile(file.id)}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
                    title="Remove file"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {parseError && (
          <p className="text-xs text-red-500 mt-2">{parseError}</p>
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-end pt-4 border-t border-slate-100">
        <button
          type="button"
          onClick={onNext}
          disabled={!canProceed}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all disabled:bg-slate-300 disabled:cursor-not-allowed font-semibold shadow-sm hover:shadow-md"
        >
          <Sparkles className="w-4 h-4" />
          Next: Generate Architecture
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
