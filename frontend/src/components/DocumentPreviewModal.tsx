import { useState, useEffect, useCallback } from 'react';
import { X, FileText, ChevronRight } from 'lucide-react';
import { PDFViewer } from './PDFViewer';
import { getDocumentFileUrl } from '../api/client';
import type { ExtractedData, TextHighlight, Citation, FieldCitation } from '../types';

interface DocumentInfo {
  id: string;
  filename: string;
  documentId: string;
}

interface DocumentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  documents: DocumentInfo[];
  extractedDataMap: Map<string, ExtractedData>;
  initialDocumentId?: string;
  activeHighlight?: {
    documentId: string;
    fieldName: string;
  } | null;
}

export function DocumentPreviewModal({
  isOpen,
  onClose,
  documents,
  extractedDataMap,
  initialDocumentId,
  activeHighlight,
}: DocumentPreviewModalProps) {
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Set initial document on open
  useEffect(() => {
    if (isOpen) {
      const docId = initialDocumentId || documents[0]?.documentId || null;
      setSelectedDocId(docId);
    }
  }, [isOpen, initialDocumentId, documents]);

  // Fetch document URL when selection changes
  useEffect(() => {
    if (!selectedDocId) {
      setDocumentUrl(null);
      return;
    }

    const fetchUrl = async () => {
      setIsLoadingUrl(true);
      setError(null);
      try {
        const result = await getDocumentFileUrl(selectedDocId);
        setDocumentUrl(result.url);
      } catch (err) {
        console.error('Failed to fetch document URL:', err);
        setError('Failed to load document');
      } finally {
        setIsLoadingUrl(false);
      }
    };

    fetchUrl();
  }, [selectedDocId]);

  // Build highlights from citations for the selected document
  const getHighlights = useCallback((): TextHighlight[] => {
    if (!selectedDocId || !activeHighlight) return [];

    // Only show highlights if we're viewing the document that's being hovered
    if (activeHighlight.documentId !== selectedDocId) return [];

    const extractedData = extractedDataMap.get(selectedDocId);
    if (!extractedData?.citations) return [];

    const fieldCitation = extractedData.citations[activeHighlight.fieldName];
    if (!fieldCitation) return [];

    const highlights: TextHighlight[] = [];

    // Handle different citation formats
    if (typeof fieldCitation === 'string') {
      // Simple string citation - no page info
      return [];
    }

    let citations: Citation[] = [];

    if (Array.isArray(fieldCitation)) {
      // Direct array of citations
      citations = fieldCitation as Citation[];
    } else if ('citation' in fieldCitation) {
      // FieldCitation with reasoning
      citations = (fieldCitation as FieldCitation).citation;
    }

    citations.forEach((citation) => {
      if (citation.page && citation.matching_text) {
        highlights.push({
          page: citation.page,
          text: citation.matching_text,
          fieldName: activeHighlight.fieldName,
        });
      }
    });

    return highlights;
  }, [selectedDocId, activeHighlight, extractedDataMap]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const highlights = getHighlights();
  const selectedDoc = documents.find((d) => d.documentId === selectedDocId);

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative flex w-full h-full">
        {/* Document Sidebar */}
        <div className="w-64 bg-white border-r border-gray-200 flex flex-col z-10">
          <div className="p-4 border-b border-gray-200">
            <h3 className="font-semibold text-gray-800">Documents</h3>
            <p className="text-xs text-gray-500 mt-1">
              {documents.length} document{documents.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {documents.map((doc) => (
              <button
                key={doc.id}
                onClick={() => setSelectedDocId(doc.documentId)}
                className={`w-full px-4 py-3 flex items-center gap-3 text-left transition-colors ${
                  selectedDocId === doc.documentId
                    ? 'bg-blue-50 border-r-2 border-blue-600'
                    : 'hover:bg-gray-50'
                }`}
              >
                <FileText
                  className={`w-5 h-5 flex-shrink-0 ${
                    selectedDocId === doc.documentId
                      ? 'text-blue-600'
                      : 'text-gray-400'
                  }`}
                />
                <span
                  className={`text-sm truncate flex-1 ${
                    selectedDocId === doc.documentId
                      ? 'text-blue-800 font-medium'
                      : 'text-gray-700'
                  }`}
                >
                  {doc.filename}
                </span>
                {selectedDocId === doc.documentId && (
                  <ChevronRight className="w-4 h-4 text-blue-600" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* PDF Viewer Area */}
        <div className="flex-1 flex flex-col bg-gray-100 z-10">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-gray-600" />
              <span className="font-medium text-gray-800">
                {selectedDoc?.filename || 'Select a document'}
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-hidden">
            {isLoadingUrl ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-gray-500">
                  <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <p className="font-medium text-gray-700">{error}</p>
                  <p className="text-sm mt-1">Please try again later</p>
                </div>
              </div>
            ) : documentUrl ? (
              <PDFViewer
                url={documentUrl}
                highlights={highlights}
                initialPage={highlights[0]?.page || 1}
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-gray-500">
                  <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <p>Select a document to preview</p>
                </div>
              </div>
            )}
          </div>

          {/* Highlight Info Footer */}
          {activeHighlight && highlights.length > 0 && (
            <div className="px-4 py-2 bg-blue-50 border-t border-blue-200">
              <p className="text-sm text-blue-800">
                <span className="font-medium">Showing source for:</span>{' '}
                <span className="bg-blue-200 px-2 py-0.5 rounded">
                  {activeHighlight.fieldName.replace(/_/g, ' ')}
                </span>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
