import { Suspense, lazy, useEffect, useState } from 'react';
import { FmedaSystemDeep } from './types/ai';
import type { FmedaNode, ProjectContext } from './types/fmeda';
import { Settings, Layout, Table as TableIcon, Home as HomeIcon, Download, ChevronDown, FileJson, FileCode, FileSpreadsheet } from 'lucide-react';
import { selectNodeCount, useFmedaStore } from './store/fmedaStore';
import { GlobalConfirmDialog } from './components/ui/GlobalConfirmDialog';
import { isLegacyFormat, migrateLegacyToFlat, flattenDeepHierarchy } from './utils/migration';
import { Popover, PopoverContent, PopoverTrigger } from './components/ui/popover';
import { useAIStore } from './store/aiStore';
import { Toaster, toast } from 'sonner';

const FmedaTable = lazy(() =>
  import('./components/FmedaTable').then((module) => ({ default: module.FmedaTable }))
);
const SettingsModal = lazy(() =>
  import('./components/SettingsModal').then((module) => ({ default: module.SettingsModal }))
);
const Home = lazy(() =>
  import('./components/Home').then((module) => ({ default: module.Home }))
);
const CreateProjectWizard = lazy(() =>
  import('./components/CreateProjectWizard').then((module) => ({ default: module.CreateProjectWizard }))
);
const SidebarLeft = lazy(() =>
  import('./components/SidebarLeft').then((module) => ({ default: module.SidebarLeft }))
);
const DocumentUpload = lazy(() =>
  import('./components/DocumentUpload').then((module) => ({ default: module.DocumentUpload }))
);

type ExporterName = 'exportToJson' | 'exportToCsv' | 'exportToExcel';

const SectionLoader = ({ label, className = '' }: { label: string; className?: string }) => (
  <div className={`flex items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/80 px-4 py-10 text-sm font-medium text-gray-500 ${className}`.trim()}>
    {label}
  </div>
);

const HeaderLoader = () => (
  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-400">
    Loading tools...
  </div>
);

function App() {
  const nodeCount = useFmedaStore(selectNodeCount);
  const setNodes = useFmedaStore((state) => state.setNodes);
  const setProjectContext = useFmedaStore((state) => state.setProjectContext);

  const [currentView, setCurrentView] = useState<'home' | 'wizard' | 'table'>('home');

  // Fix legacy AI provider config to use Gemini
  useEffect(() => {
    const aiState = useAIStore.getState();
    if (aiState.config.provider !== 'gemini') {
      aiState.setConfig({
        provider: 'gemini',
        model: 'gemini-3.1-flash-lite-preview',
      });
    }
  }, []);

  // Handle migration of legacy data if present
  useEffect(() => {
    const savedData = localStorage.getItem('fmeda-storage');
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        // Zustand persist might wrap the state
        const state = parsed.state || parsed;
        if (state.components && isLegacyFormat(state.components)) {
          const migratedNodes = migrateLegacyToFlat(state.components);
          setNodes(migratedNodes);
        }
      } catch (e) {
        console.error('Failed to parse saved data for migration', e);
      }
    }
  }, [setNodes]);

  // Removed automatic routing to 'table' on startup to show the Home dashboard first

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const runExport = async (
    formatLabel: string,
    exporterName: ExporterName
  ) => {
    try {
      const exporters = await import('./utils/export');
      const exporter = exporters[exporterName] as (
        nodes: FmedaNode[],
        projectContext: ProjectContext | null
      ) => Promise<{ success: boolean; fileName?: string }>;
      const { nodes, projectContext } = useFmedaStore.getState();
      const result = await exporter(Object.values(nodes), projectContext);
      if (result && result.success) {
        toast.success(`${formatLabel} exported successfully`, {
          description: `Saved as ${result.fileName}`
        });
      }
    } catch (error) {
      const description = error instanceof Error ? error.message : (typeof error === 'string' ? error : "An unexpected error occurred during export.");
      toast.error(`Failed to export ${formatLabel}`, { description });
    }
  };

  const handleJsonExport = () => runExport('JSON', 'exportToJson');
  const handleCsvExport = () => runExport('CSV', 'exportToCsv');
  const handleExcelExport = () => runExport('Excel workbook', 'exportToExcel');

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      <Toaster position="bottom-right" richColors />
      <GlobalConfirmDialog />

      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shadow-sm z-50">
        <div className="flex items-center space-x-4">
          <h1
            className="text-xl font-bold text-blue-600 cursor-pointer flex items-center"
            onClick={() => setCurrentView(nodeCount > 0 ? 'table' : 'home')}
          >
            <Layout className="mr-2 w-6 h-6" />
            FMEDA Pro
          </h1>

          {nodeCount > 0 && (
            <nav className="flex items-center bg-gray-100 rounded-lg p-1 ml-8">
              <button
                onClick={() => setCurrentView('table')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center ${
                  currentView === 'table'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <TableIcon className="w-4 h-4 mr-1.5" />
                Analysis
              </button>
              <button
                onClick={() => setCurrentView('home')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center ${
                  currentView === 'home'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <HomeIcon className="w-4 h-4 mr-1.5" />
                Dashboard
              </button>
            </nav>
          )}
        </div>

        <div className="flex items-center space-x-3">
          {nodeCount > 0 && currentView === 'table' && (
            <div className="flex items-center gap-2 mr-2">
              <Suspense fallback={<HeaderLoader />}>
                <DocumentUpload />
              </Suspense>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className="flex items-center gap-1.5 text-gray-700 px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 shadow-sm transition-all text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    title="Save As"
                  >
                    <Download size={16} className="text-gray-500" />
                    <span>Save As</span>
                    <ChevronDown size={16} className="text-gray-400" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-48 p-1.5 border border-gray-200 shadow-xl rounded-xl">
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={handleJsonExport}
                      className="flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-700 rounded-lg transition-colors text-left"
                    >
                      <FileJson size={16} className="text-blue-500 shrink-0" />
                      <span>JSON File</span>
                    </button>
                    <button
                      disabled
                      className="flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-gray-400 cursor-not-allowed rounded-lg text-left border-0 bg-transparent"
                    >
                      <FileCode size={16} className="shrink-0" />
                      <span>XML File <span className="text-[10px] uppercase ml-1.5 px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-md font-bold tracking-wider">Soon</span></span>
                    </button>
                    <button
                      onClick={handleCsvExport}
                      className="flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 rounded-lg transition-colors text-left"
                    >
                      <FileSpreadsheet size={16} className="text-emerald-500 shrink-0" />
                      <span>CSV File</span>
                    </button>
                    <button
                      onClick={handleExcelExport}
                      className="flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 rounded-lg transition-colors text-left"
                    >
                      <FileSpreadsheet size={16} className="text-emerald-600 shrink-0" />
                      <span>Excel Workbook</span>
                    </button>
                  </div>
                </PopoverContent>
              </Popover>
              <div className="w-px h-6 bg-gray-200 mx-1" />
            </div>
          )}

          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors"
            title="Settings"
          >
            <Settings size={20} />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {currentView === 'home' && (
          <main className="flex-1 overflow-y-auto p-8">
            <div className="max-w-5xl mx-auto">
              <Suspense fallback={<SectionLoader label="Loading dashboard..." />}>
                <Home
                  onNewProject={() => setCurrentView('wizard')}
                  onImportSuccess={() => setCurrentView('table')}
                />
              </Suspense>
            </div>
          </main>
        )}

        {currentView === 'wizard' && (
          <main className="flex-1 overflow-y-auto p-8">
            <div className="max-w-4xl mx-auto">
              <Suspense fallback={<SectionLoader label="Loading project wizard..." />}>
                <CreateProjectWizard
                  onComplete={(migratedNodes, context) => {
                    if (isLegacyFormat(migratedNodes)) {
                      setNodes(migrateLegacyToFlat(migratedNodes));
                    } else {
                      // migratedNodes is FmedaSystemDeep[] in this branch
                      setNodes(flattenDeepHierarchy(migratedNodes as FmedaSystemDeep[]));
                    }

                    // Save the context
                    setProjectContext({
                      projectName: context.projectName,
                      safetyStandard: context.safetyStandard,
                      targetAsil: context.targetAsil,
                      safetyGoal: context.safetyGoal,
                      documents: context.documents,
                    });

                    useFmedaStore.getState().setSelectedId(null);
                    setCurrentView('table');
                  }}
                  onCancel={() => setCurrentView('home')}
                />
              </Suspense>
            </div>
          </main>
        )}

        {currentView === 'table' && (
          <>
            <Suspense fallback={<SectionLoader label="Loading hierarchy..." className="m-4 w-80 flex-shrink-0" />}>
              <SidebarLeft />
            </Suspense>

            <main className="flex-1 flex flex-col min-w-0 bg-white overflow-hidden">
              <div className="flex-1 overflow-auto p-6">
                <Suspense fallback={<SectionLoader label="Loading analysis workspace..." className="min-h-[320px]" />}>
                  <FmedaTable />
                </Suspense>
              </div>
            </main>
          </>
        )}
      </div>

      {isSettingsOpen && (
        <Suspense fallback={null}>
          <SettingsModal onClose={() => setIsSettingsOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}

export default App;
