import { Database } from 'lucide-react';
import { useStore } from '../store/useStore';

export function ExtractedDataView() {
  const { selectedDocumentId, selectedExtractedData, documents } = useStore();

  const selectedDoc = documents.find((d) => d.id === selectedDocumentId);

  if (!selectedDocumentId) {
    return (
      <div className="bg-white rounded-lg shadow-md p-8 text-center text-gray-500">
        <Database className="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <p>Select a document to view extracted data</p>
      </div>
    );
  }

  if (selectedExtractedData.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-8 text-center text-gray-500">
        <Database className="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <p>No extracted data available yet</p>
        <p className="text-sm">Processing may still be in progress</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800">
          Extracted Data
        </h2>
        {selectedDoc && (
          <p className="text-sm text-gray-500 truncate">{selectedDoc.original_filename}</p>
        )}
      </div>
      <div className="max-h-[500px] overflow-y-auto p-4">
        {selectedExtractedData.map((extracted) => (
          <div key={extracted.id} className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium px-2 py-1 bg-blue-100 text-blue-700 rounded">
                {extracted.schema_name}
              </span>
              <span className="text-xs text-gray-400">
                {new Date(extracted.created_at).toLocaleString()}
              </span>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {Object.entries(extracted.data).map(([key, value]) => (
                    <tr key={key} className="border-b border-gray-200 last:border-0">
                      <td className="py-2 pr-4 font-medium text-gray-600 whitespace-nowrap align-top">
                        {key.replace(/_/g, ' ')}
                      </td>
                      <td className="py-2 text-gray-800">
                        {renderValue(value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {extracted.confidence_scores && (
              <div className="mt-2">
                <p className="text-xs font-medium text-gray-500 mb-1">Confidence Scores</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(extracted.confidence_scores).map(([key, score]) => (
                    <span
                      key={key}
                      className={`text-xs px-2 py-1 rounded ${
                        Number(score) > 0.8
                          ? 'bg-green-100 text-green-700'
                          : Number(score) > 0.5
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {key}: {(Number(score) * 100).toFixed(0)}%
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function renderValue(value: unknown): React.ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-gray-400 italic">N/A</span>;
  }
  if (Array.isArray(value)) {
    return (
      <ul className="list-disc list-inside">
        {value.map((item, idx) => (
          <li key={idx}>{String(item)}</li>
        ))}
      </ul>
    );
  }
  if (typeof value === 'object') {
    return (
      <pre className="text-xs bg-gray-100 p-2 rounded overflow-x-auto">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }
  return String(value);
}
