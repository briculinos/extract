import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, Upload, Table, MessageSquare, ChevronRight } from 'lucide-react';
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

// Step indicator component
function StepIndicator({
  steps,
  currentStep
}: {
  steps: { id: string; label: string; icon: React.ReactNode; path: string }[];
  currentStep: number;
}) {
  const navigate = useNavigate();

  return (
    <div className="flex items-center gap-1">
      {steps.map((step, index) => {
        const isActive = index === currentStep;
        const isPast = index < currentStep;
        const isClickable = isPast;

        return (
          <div key={step.id} className="flex items-center">
            <button
              onClick={() => isClickable && navigate(step.path)}
              disabled={!isClickable}
              className={`
                flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200
                ${isActive
                  ? 'bg-blue-100 text-blue-700 shadow-sm'
                  : isPast
                    ? 'text-gray-500 hover:text-blue-600 hover:bg-gray-100 cursor-pointer'
                    : 'text-gray-300 cursor-default'
                }
              `}
            >
              <span className={`transition-transform duration-200 ${isActive ? 'scale-110' : ''}`}>
                {step.icon}
              </span>
              <span className="hidden sm:inline">{step.label}</span>
            </button>
            {index < steps.length - 1 && (
              <ChevronRight
                size={16}
                className={`mx-1 ${isPast ? 'text-blue-400' : 'text-gray-300'}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Header() {
  const navigate = useNavigate();
  const location = useLocation();

  // Define steps for the flow
  const steps = [
    { id: 'upload', label: 'Upload', icon: <Upload size={16} />, path: '/' },
    { id: 'results', label: 'Results', icon: <Table size={16} />, path: '/results' },
    { id: 'insights', label: 'Insights', icon: <MessageSquare size={16} />, path: '/insights' },
  ];

  // Determine current step based on path
  const getCurrentStep = () => {
    switch (location.pathname) {
      case '/results': return 1;
      case '/insights': return 2;
      default: return 0;
    }
  };

  const currentStep = getCurrentStep();
  const canGoBack = currentStep > 0;

  // Get back navigation info
  const getBackInfo = () => {
    switch (location.pathname) {
      case '/results': return { path: '/', label: 'Upload' };
      case '/insights': return { path: '/results', label: 'Results' };
      default: return null;
    }
  };

  const backInfo = getBackInfo();
  const showInsightsExport = location.pathname === '/results';

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Left: Logo + Back Button */}
          <div className="flex items-center gap-4">
            {/* Back Button - appears on Results and Insights pages */}
            {canGoBack && backInfo && (
              <button
                onClick={() => navigate(backInfo.path)}
                className="group flex items-center gap-1.5 px-3 py-2 -ml-3 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-all duration-200"
              >
                <ChevronLeft
                  size={20}
                  className="transition-transform duration-200 group-hover:-translate-x-0.5"
                />
                <span className="text-sm font-medium">{backInfo.label}</span>
              </button>
            )}

            {/* Logo */}
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
              <span className="text-xl font-bold hidden md:block">
                <span className="text-blue-600">frostlogic</span>
                <span className="text-gray-800 ml-2">Extract</span>
              </span>
            </div>
          </div>

          {/* Center: Step Indicator */}
          <div className="hidden md:flex">
            <StepIndicator steps={steps} currentStep={currentStep} />
          </div>

          {/* Right: Action Buttons */}
          <div className="flex items-center gap-2">
            {showInsightsExport && (
              <>
                <button
                  onClick={() => navigate('/insights')}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
                >
                  <MessageSquare size={16} />
                  <span className="hidden sm:inline">Insights</span>
                </button>
                <button
                  onClick={() => {
                    const event = new CustomEvent('openExportModal');
                    window.dispatchEvent(event);
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium"
                >
                  Export
                </button>
              </>
            )}
            {location.pathname === '/insights' && (
              <button
                onClick={() => navigate('/results')}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium"
              >
                <Table size={16} />
                <span className="hidden sm:inline">View Data</span>
              </button>
            )}
          </div>
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
