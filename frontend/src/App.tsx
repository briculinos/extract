import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { FileUpload } from './components/FileUpload';
import { DocumentPreview } from './components/DocumentPreview';
import { SchemaSelector } from './components/SchemaSelector';
import { ResultsPage } from './components/ResultsPage';
import { InsightsChat } from './components/InsightsChat';

function ExtractPage() {
  const navigate = useNavigate();

  const handleProceedToExtract = () => {
    navigate('/results');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Panel */}
          <div className="space-y-6">
            <SchemaSelector />
            <FileUpload />
            <button
              onClick={handleProceedToExtract}
              className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
            >
              Proceed to Extract
            </button>
          </div>

          {/* Right Panel - Preview */}
          <div>
            <DocumentPreview />
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultsPageWrapper() {
  return <ResultsPage />;
}

function InsightsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <InsightsChat />
    </div>
  );
}

function Header() {
  const navigate = useNavigate();
  const location = useLocation();

  const showInsightsExport = location.pathname === '/results';

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => navigate('/')}
          >
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg
                viewBox="0 0 24 24"
                className="w-5 h-5 text-white"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <span className="text-xl font-bold">
              <span className="text-blue-600">frostlogic</span>
              <span className="text-gray-800 ml-2">Extract</span>
            </span>
          </div>

          {showInsightsExport && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate('/insights')}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
              >
                Insights
              </button>
              <button
                onClick={() => {
                  const event = new CustomEvent('openExportModal');
                  window.dispatchEvent(event);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
              >
                Export
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <Header />

        <main className="flex-1">
          <Routes>
            <Route path="/" element={<ExtractPage />} />
            <Route path="/results" element={<ResultsPageWrapper />} />
            <Route path="/insights" element={<InsightsPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
