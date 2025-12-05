import { useEffect } from 'react';
import { FileText, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { getDocuments, getExtractedData } from '../api/client';
import { useStore } from '../store/useStore';

const StatusIcon = ({ status }: { status: string }) => {
  switch (status) {
    case 'completed':
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    case 'failed':
      return <XCircle className="w-5 h-5 text-red-500" />;
    case 'processing':
      return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
    default:
      return <Clock className="w-5 h-5 text-gray-400" />;
  }
};

export function DocumentList() {
  const {
    documents,
    setDocuments,
    activeJobs,
    selectedDocumentId,
    setSelectedDocumentId,
    setSelectedExtractedData,
  } = useStore();

  useEffect(() => {
    const loadDocuments = async () => {
      try {
        const docs = await getDocuments(50);
        setDocuments(docs);
      } catch (error) {
        console.error('Failed to load documents:', error);
      }
    };
    loadDocuments();
  }, [setDocuments]);

  const handleSelectDocument = async (documentId: string) => {
    setSelectedDocumentId(documentId);
    try {
      const data = await getExtractedData(documentId);
      setSelectedExtractedData(data);
    } catch (error) {
      console.error('Failed to load extracted data:', error);
      setSelectedExtractedData([]);
    }
  };

  const getDocumentStatus = (docId: string): string => {
    for (const job of activeJobs.values()) {
      if (job.document_id === docId) {
        return job.status;
      }
    }
    return 'completed';
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800">Documents</h2>
      </div>
      <div className="max-h-[400px] overflow-y-auto">
        {documents.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>No documents yet</p>
            <p className="text-sm">Upload documents to get started</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {documents.map((doc) => {
              const status = getDocumentStatus(doc.id);
              return (
                <li
                  key={doc.id}
                  onClick={() => handleSelectDocument(doc.id)}
                  className={`px-4 py-3 cursor-pointer transition hover:bg-gray-50 ${
                    selectedDocumentId === doc.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <StatusIcon status={status} />
                      <div className="min-w-0">
                        <p className="font-medium text-gray-800 truncate">
                          {doc.original_filename}
                        </p>
                        <p className="text-sm text-gray-500">
                          {formatFileSize(doc.file_size)} • {formatDate(doc.created_at)}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        doc.source_type === 'upload'
                          ? 'bg-gray-100 text-gray-600'
                          : 'bg-purple-100 text-purple-600'
                      }`}
                    >
                      {doc.source_type === 'upload' ? 'Upload' : 'URL'}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
