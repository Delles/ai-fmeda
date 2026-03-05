import { useState, useEffect } from 'react';
import { Settings, Layout, Table as TableIcon, Home as HomeIcon } from 'lucide-react';
import { FmedaTable } from './components/FmedaTable';
import { SettingsModal } from './components/SettingsModal';
import { Home } from './components/Home';
import { CreateProjectWizard } from './components/CreateProjectWizard';
import { useFmedaStore } from './store/fmedaStore';
import { GlobalConfirmDialog } from './components/ui/GlobalConfirmDialog';
import { SidebarLeft } from './components/SidebarLeft';
import { SidebarRight } from './components/SidebarRight';
import { isLegacyFormat, migrateLegacyToFlat, flattenDeepHierarchy } from './utils/migration';

function App() {
  const { nodes, setNodes } = useFmedaStore();
  const nodeCount = Object.keys(nodes).length;
  
  const [currentView, setCurrentView] = useState<'home' | 'wizard' | 'table'>(
    nodeCount > 0 ? 'table' : 'home'
  );

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
  }, []);

  useEffect(() => {
    if (nodeCount > 0 && currentView === 'home') {
      setCurrentView('table');
    }
  }, [nodeCount]);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      <GlobalConfirmDialog />
      
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shadow-sm z-10">
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
              <Home 
                onNewProject={() => setCurrentView('wizard')} 
                onImportSuccess={() => setCurrentView('table')} 
              />
            </div>
          </main>
        )}

        {currentView === 'wizard' && (
          <main className="flex-1 overflow-y-auto p-8">
            <div className="max-w-4xl mx-auto">
              <CreateProjectWizard 
                onComplete={(migratedNodes) => {
                  if (isLegacyFormat(migratedNodes)) {
                    setNodes(migrateLegacyToFlat(migratedNodes));
                  } else {
                    setNodes(flattenDeepHierarchy(migratedNodes as any));
                  }
                  setCurrentView('table');
                }}
                onCancel={() => setCurrentView('home')}
              />
            </div>
          </main>
        )}

        {currentView === 'table' && (
          <>
            <SidebarLeft />
            
            <main className="flex-1 flex flex-col min-w-0 bg-white overflow-hidden">
              <div className="flex-1 overflow-auto p-6">
                <FmedaTable />
              </div>
            </main>

            <SidebarRight />
          </>
        )}
      </div>

      {isSettingsOpen && <SettingsModal onClose={() => setIsSettingsOpen(false)} />}
    </div>
  );
}

export default App;
