import { useState, useMemo } from 'react';
import { Document, Page } from 'react-pdf';
import { FileText, X, CheckCircle, Loader2, Image, FileSpreadsheet } from 'lucide-react';
import { useStore } from '../store/useStore';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

export function DocumentPreview() {
  const { uploadedFiles } = useStore();
  const [showModal, setShowModal] = useState(false);
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);

  const filesToShow = uploadedFiles;

  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext || '')) {
      return <Image className="w-16 h-16 text-blue-500" />;
    }
    if (['xlsx', 'xls', 'csv'].includes(ext || '')) {
      return <FileSpreadsheet className="w-16 h-16 text-green-500" />;
    }
    return <FileText className="w-16 h-16 text-red-500" />;
  };

  const getFileType = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return 'PDF Document';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext || '')) return 'Image';
    if (['xlsx', 'xls'].includes(ext || '')) return 'Excel Spreadsheet';
    if (ext === 'csv') return 'CSV File';
    if (ext === 'docx') return 'Word Document';
    if (ext === 'txt') return 'Text File';
    return 'Document';
  };

  const formatFileSize = (bytes: number | undefined) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (filesToShow.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex justify-end mb-4">
          <button
            disabled
            className="px-6 py-2 bg-blue-600 text-white rounded-lg opacity-50 cursor-not-allowed font-medium"
          >
            Preview
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="relative">
            <div className="absolute top-4 left-4 w-[30rem] h-[38rem] bg-white border-2 border-gray-200 rounded-lg shadow-sm" />
            <div className="absolute top-2 left-2 w-[30rem] h-[38rem] bg-white border-2 border-gray-200 rounded-lg shadow-sm" />
            <div className="relative w-[30rem] h-[38rem] bg-white border-2 border-gray-200 rounded-lg shadow-md flex items-center justify-center">
              <div className="text-center text-gray-400">
                <FileText className="w-24 h-24 mx-auto mb-2" />
                <p className="text-sm">No documents uploaded</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const maxVisible = Math.min(filesToShow.length, 4);
  const visibleFiles = filesToShow.slice(0, maxVisible).reverse();

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setShowModal(true)}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
        >
          Preview
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="relative h-[44rem] w-[34rem]">
          {visibleFiles.map((file, index) => {
            const offset = index * 16;
            const isTopCard = index === visibleFiles.length - 1;

            return (
              <div
                key={file.id}
                className="absolute w-[30rem] h-[38rem] bg-white border-2 border-blue-200 rounded-lg shadow-md transition-all hover:shadow-lg cursor-pointer"
                style={{
                  top: offset,
                  left: offset,
                  zIndex: index + 1,
                }}
                onClick={() => {
                  setSelectedFileIndex(filesToShow.findIndex(f => f.id === file.id));
                  setShowModal(true);
                }}
              >
                <div className="p-6 h-full flex flex-col">
                  <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-100">
                    <FileText className="w-7 h-7 text-blue-600 flex-shrink-0" />
                    <span className="text-base font-medium text-gray-800 truncate flex-1">
                      {file.filename}
                    </span>
                    {file.status === 'completed' && (
                      <CheckCircle className="w-6 h-6 text-green-500 flex-shrink-0" />
                    )}
                    {(file.status === 'uploading' || file.status === 'pending') && (
                      <Loader2 className="w-6 h-6 text-blue-500 flex-shrink-0 animate-spin" />
                    )}
                  </div>
                  <div className="flex-1 bg-gray-50 rounded-lg flex flex-col items-center justify-center overflow-hidden">
                    <FilePreviewThumbnail file={file} isTopCard={isTopCard} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {filesToShow.length > 4 && (
        <p className="text-center text-sm text-gray-500 mt-4">
          +{filesToShow.length - 4} more documents
        </p>
      )}

      {/* Preview Modal - Shows actual documents */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] mx-4 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
              <h3 className="text-lg font-semibold text-gray-800">
                Document Preview ({filesToShow.length} documents)
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex flex-1 overflow-hidden">
              {/* Document list sidebar */}
              <div className="w-64 border-r border-gray-200 overflow-y-auto flex-shrink-0">
                {filesToShow.map((file, index) => (
                  <div
                    key={file.id}
                    onClick={() => setSelectedFileIndex(index)}
                    className={`px-4 py-3 cursor-pointer border-b border-gray-100 hover:bg-gray-50 ${
                      selectedFileIndex === index ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
                      <span className="text-sm font-medium text-gray-800 truncate">
                        {file.filename}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1 ml-6">
                      {getFileType(file.filename)}
                    </p>
                  </div>
                ))}
              </div>

              {/* Document preview area */}
              <div className="flex-1 bg-gray-100 p-6 overflow-auto">
                {filesToShow[selectedFileIndex] && (
                  <div className="h-full flex flex-col items-center justify-center">
                    {filesToShow[selectedFileIndex].file ? (
                      // If we have the actual file, try to preview it
                      (() => {
                        const file = filesToShow[selectedFileIndex].file!;
                        const ext = filesToShow[selectedFileIndex].filename.split('.').pop()?.toLowerCase();

                        // Image preview
                        if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext || '')) {
                          return (
                            <img
                              src={URL.createObjectURL(file)}
                              alt={filesToShow[selectedFileIndex].filename}
                              className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                            />
                          );
                        }

                        // PDF preview
                        if (ext === 'pdf') {
                          return (
                            <iframe
                              src={URL.createObjectURL(file)}
                              className="w-full h-full min-h-[600px] rounded-lg shadow-lg bg-white"
                              title={filesToShow[selectedFileIndex].filename}
                            />
                          );
                        }

                        // Text file preview
                        if (['txt', 'csv', 'json'].includes(ext || '')) {
                          return (
                            <TextFilePreview file={file} />
                          );
                        }

                        // Other files - show info card
                        return (
                          <div className="bg-white rounded-lg shadow-lg p-8 text-center max-w-md">
                            {getFileIcon(filesToShow[selectedFileIndex].filename)}
                            <h4 className="text-lg font-semibold text-gray-800 mt-4">
                              {filesToShow[selectedFileIndex].filename}
                            </h4>
                            <p className="text-gray-500 mt-2">
                              {getFileType(filesToShow[selectedFileIndex].filename)}
                            </p>
                            <p className="text-gray-400 text-sm mt-1">
                              {formatFileSize(file.size)}
                            </p>
                            <p className="text-gray-400 text-sm mt-4">
                              Preview not available for this file type
                            </p>
                          </div>
                        );
                      })()
                    ) : (
                      // No file available - show placeholder
                      <div className="bg-white rounded-lg shadow-lg p-8 text-center max-w-md">
                        {getFileIcon(filesToShow[selectedFileIndex].filename)}
                        <h4 className="text-lg font-semibold text-gray-800 mt-4">
                          {filesToShow[selectedFileIndex].filename}
                        </h4>
                        <p className="text-gray-500 mt-2">
                          {getFileType(filesToShow[selectedFileIndex].filename)}
                        </p>
                        <p className="text-gray-400 text-sm mt-4">
                          Document uploaded from URL
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Component to show file thumbnail in the card
function FilePreviewThumbnail({ file, isTopCard }: { file: { filename: string; file?: File }; isTopCard: boolean }) {
  const ext = file.filename.split('.').pop()?.toLowerCase();
  const fileUrl = useMemo(() => {
    if (file.file) {
      return URL.createObjectURL(file.file);
    }
    return null;
  }, [file.file]);

  // PDF preview
  if (ext === 'pdf' && fileUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center p-2">
        <Document
          file={fileUrl}
          loading={
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
          }
          error={
            <div className="text-center text-gray-400">
              <FileText className="w-16 h-16 mx-auto text-red-500" />
              <p className="text-sm mt-2">Failed to load PDF</p>
            </div>
          }
          className="flex justify-center"
        >
          <Page
            pageNumber={1}
            width={420}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            className="shadow-md rounded overflow-hidden"
          />
        </Document>
      </div>
    );
  }

  // Image preview
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext || '') && fileUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center p-4">
        <img
          src={fileUrl}
          alt={file.filename}
          className="max-w-full max-h-full object-contain rounded-lg shadow-md"
        />
      </div>
    );
  }

  // Fallback for other file types
  const getFileIcon = (filename: string) => {
    if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext || '')) {
      return <Image className="w-16 h-16 text-blue-500" />;
    }
    if (['xlsx', 'xls', 'csv'].includes(ext || '')) {
      return <FileSpreadsheet className="w-16 h-16 text-green-500" />;
    }
    return <FileText className="w-16 h-16 text-red-500" />;
  };

  const getFileType = (filename: string) => {
    if (ext === 'pdf') return 'PDF Document';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext || '')) return 'Image';
    if (['xlsx', 'xls'].includes(ext || '')) return 'Excel Spreadsheet';
    if (ext === 'csv') return 'CSV File';
    if (ext === 'docx') return 'Word Document';
    if (ext === 'txt') return 'Text File';
    return 'Document';
  };

  return (
    <div className="text-center text-gray-400">
      {getFileIcon(file.filename)}
      {isTopCard && (
        <>
          <p className="text-lg font-medium text-gray-700 mt-4">
            {getFileType(file.filename)}
          </p>
          <p className="text-sm text-gray-400 mt-2">
            {file.file ? formatFileSizeStatic(file.file.size) : ''}
          </p>
        </>
      )}
    </div>
  );
}

function formatFileSizeStatic(bytes: number | undefined) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Component to preview text files
function TextFilePreview({ file }: { file: File }) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useState(() => {
    const reader = new FileReader();
    reader.onload = (e) => {
      setContent(e.target?.result as string || '');
      setLoading(false);
    };
    reader.readAsText(file);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <pre className="bg-white rounded-lg shadow-lg p-6 overflow-auto max-w-full max-h-full text-sm text-gray-800 whitespace-pre-wrap">
      {content.slice(0, 10000)}
      {content.length > 10000 && '\n\n... (truncated)'}
    </pre>
  );
}
