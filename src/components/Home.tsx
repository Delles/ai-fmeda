import React, { useRef } from 'react';
import { FilePlus, Upload } from 'lucide-react';
import { useFmedaStore } from '../store/fmedaStore';
import { importFromJson } from '../utils/export';

interface HomeProps {
  onNewProject: () => void;
  onImportSuccess: () => void;
}

export const Home: React.FC<HomeProps> = ({ onNewProject, onImportSuccess }) => {
  const { setNodes } = useFmedaStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const nodesRecord = await importFromJson(file);
        setNodes(nodesRecord);
        onImportSuccess();
      } catch (error: any) {
        alert(`Import failed: ${error.message}`);
      } finally {
        // Reset file input
        e.target.value = '';
      }
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <h2 className="text-3xl font-bold text-gray-900 mb-4">Welcome to FMEDA MVP</h2>
      <p className="text-lg text-gray-600 mb-12 max-w-2xl">
        Start a new Failure Modes, Effects, and Diagnostic Analysis project or import an existing one to continue your work.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
        {/* Create New Project Card */}
        <button
          onClick={onNewProject}
          className="flex flex-col items-center p-8 bg-white border-2 border-transparent rounded-2xl shadow-sm hover:shadow-md hover:border-blue-500 transition-all group text-left"
        >
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            <FilePlus size={32} />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Create New Project</h3>
          <p className="text-gray-500 text-center">
            Start a fresh FMEDA analysis using our AI-powered wizard to help you set up components and failure modes.
          </p>
        </button>

        {/* Import Project Card */}
        <button
          onClick={handleImportClick}
          className="flex flex-col items-center p-8 bg-white border-2 border-transparent rounded-2xl shadow-sm hover:shadow-md hover:border-green-500 transition-all group text-left"
        >
          <div className="w-16 h-16 bg-green-50 text-green-600 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            <Upload size={32} />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Import Project</h3>
          <p className="text-gray-500 text-center">
            Load an existing FMEDA project from a JSON file to continue your analysis and make updates.
          </p>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".json"
            className="hidden"
          />
        </button>
      </div>
    </div>
  );
};
