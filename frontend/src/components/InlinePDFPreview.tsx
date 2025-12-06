import { useState, useEffect, useCallback } from 'react';
import { Document, Page } from 'react-pdf';
import { Loader2, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import type { TextHighlight, ExtractedData, Citation, FieldCitation } from '../types';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

interface InlinePDFPreviewProps {
  documentId: string | null;
  extractedData: ExtractedData | null;
  activeField: string | null;
  filename?: string | null;
  width?: number;
}

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff', '.tif'];

function isImageFile(filename: string | null | undefined): boolean {
  if (!filename) return false;
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  return IMAGE_EXTENSIONS.includes(ext);
}

export function InlinePDFPreview({
  documentId,
  extractedData,
  activeField,
  filename,
  width = 350,
}: InlinePDFPreviewProps) {
  const isImage = isImageFile(filename);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [error, setError] = useState<string | null>(null);

  // Set document URL directly when documentId changes
  useEffect(() => {
    if (!documentId) {
      setDocumentUrl(null);
      setError(null);
      return;
    }

    // Reset page number when switching documents
    setPageNumber(1);
    setNumPages(0);

    // Use the streaming endpoint directly
    setDocumentUrl(`${API_BASE_URL}/documents/${documentId}/file`);
    setError(null);
    setIsLoading(false);
  }, [documentId]);

  // Build highlights from citations OR extracted values
  const highlights: TextHighlight[] = [];

  if (activeField && extractedData) {
    // First try citations if available
    if (extractedData.citations) {
      const fieldCitation = extractedData.citations[activeField];
      if (fieldCitation) {
        let citations: Citation[] = [];

        if (Array.isArray(fieldCitation)) {
          citations = fieldCitation as Citation[];
        } else if (typeof fieldCitation === 'object' && 'citation' in fieldCitation) {
          citations = (fieldCitation as FieldCitation).citation;
        }

        citations.forEach((citation) => {
          if (citation.page && citation.matching_text) {
            highlights.push({
              page: citation.page,
              text: citation.matching_text,
              fieldName: activeField,
            });
          }
        });
      }
    }

    // Fallback: if no citations, use the extracted value itself as the search text
    if (highlights.length === 0 && extractedData.data) {
      const fieldValue = extractedData.data[activeField];
      if (fieldValue && typeof fieldValue === 'string' && fieldValue.trim() && fieldValue !== '-') {
        // Search all pages (start with page 1)
        highlights.push({
          page: 1, // Will search on current page
          text: fieldValue.trim(),
          fieldName: activeField,
        });
      }
    }
  }

  // For value-based highlights (no citations), search on ALL pages
  const hasCitations = extractedData?.citations && Object.keys(extractedData.citations).length > 0;
  const currentPageHighlights = hasCitations
    ? highlights.filter((h) => h.page === pageNumber)
    : highlights; // Search on current page regardless

  // Custom text renderer for highlighting with red rectangle border
  const customTextRenderer = useCallback(
    (textItem: { str: string }) => {
      if (currentPageHighlights.length === 0) {
        return textItem.str;
      }

      for (const highlight of currentPageHighlights) {
        const highlightTextLower = highlight.text?.toLowerCase() || '';
        const textItemLower = textItem.str.toLowerCase();

        // Check if the text item contains the highlight text
        if (highlightTextLower && textItemLower.includes(highlightTextLower)) {
          const regex = new RegExp(`(${escapeRegExp(highlight.text)})`, 'gi');
          return textItem.str.replace(regex, '<mark>$1</mark>');
        }
        // Check if the highlight text contains this text item (for multi-span text)
        if (highlightTextLower && highlightTextLower.includes(textItemLower) && textItem.str.trim().length > 0) {
          return `<mark>${textItem.str}</mark>`;
        }
      }
      return textItem.str;
    },
    [currentPageHighlights]
  );

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  }, []);

  if (!documentId) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100 rounded-lg">
        <p className="text-gray-400 text-sm">No document selected</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100 rounded-lg">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100 rounded-lg">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  // Render image preview
  if (isImage) {
    return (
      <div className="flex flex-col h-full bg-gray-100 rounded-lg overflow-hidden">
        {/* Mini toolbar for images */}
        <div className="flex items-center justify-end px-2 py-1 bg-white border-b text-xs">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setScale((s) => Math.max(0.3, s - 0.1))}
              disabled={scale <= 0.3}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
            >
              <ZoomOut size={14} />
            </button>
            <span className="text-gray-600 w-10 text-center">{Math.round(scale * 100)}%</span>
            <button
              onClick={() => setScale((s) => Math.min(2.0, s + 0.1))}
              disabled={scale >= 2.0}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
            >
              <ZoomIn size={14} />
            </button>
          </div>
        </div>

        {/* Image content */}
        <div className="flex-1 overflow-auto p-2 flex items-start justify-center">
          {documentUrl && (
            <img
              src={documentUrl}
              alt={filename || 'Document preview'}
              style={{ width: `${(width - 20) * scale}px` }}
              className="shadow-md rounded"
              onError={() => setError('Failed to load image')}
            />
          )}
        </div>

        {/* Highlight info */}
        {activeField && (
          <div className="px-2 py-1 bg-blue-50 border-t border-blue-200">
            <p className="text-xs text-blue-700 truncate">
              <span className="font-medium">Field:</span>{' '}
              {activeField.replace(/_/g, ' ')}
            </p>
          </div>
        )}
      </div>
    );
  }

  // Render PDF preview
  return (
    <div className="flex flex-col h-full bg-gray-100 rounded-lg overflow-hidden">
      {/* Mini toolbar */}
      <div className="flex items-center justify-between px-2 py-1 bg-white border-b text-xs">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            disabled={pageNumber <= 1}
            className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-gray-600 min-w-[60px] text-center">
            {pageNumber}/{numPages || '?'}
          </span>
          <button
            onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
            disabled={pageNumber >= numPages}
            className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
          >
            <ChevronRight size={14} />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setScale((s) => Math.max(0.3, s - 0.1))}
            disabled={scale <= 0.3}
            className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
          >
            <ZoomOut size={14} />
          </button>
          <span className="text-gray-600 w-10 text-center">{Math.round(scale * 100)}%</span>
          <button
            onClick={() => setScale((s) => Math.min(1.5, s + 0.1))}
            disabled={scale >= 1.5}
            className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
          >
            <ZoomIn size={14} />
          </button>
        </div>
      </div>

      {/* PDF content */}
      <div className="flex-1 overflow-auto p-2">
        {documentUrl && (
          <Document
            key={documentId}
            file={documentUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={(err) => {
              console.error('PDF load error:', err);
              setError('Failed to load PDF');
            }}
            loading={
              <div className="flex items-center justify-center h-40">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              </div>
            }
            className="flex justify-center"
          >
            <Page
              pageNumber={pageNumber}
              scale={scale}
              width={width - 20}
              renderTextLayer={true}
              renderAnnotationLayer={false}
              customTextRenderer={currentPageHighlights.length > 0 ? customTextRenderer : undefined}
              className="shadow-md rounded overflow-hidden"
            />
          </Document>
        )}
      </div>

      {/* Highlight info */}
      {activeField && (
        <div className="px-2 py-1 bg-blue-50 border-t border-blue-200">
          <p className="text-xs text-blue-700 truncate">
            <span className="font-medium">Source:</span>{' '}
            {activeField.replace(/_/g, ' ')}
          </p>
        </div>
      )}
    </div>
  );
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
