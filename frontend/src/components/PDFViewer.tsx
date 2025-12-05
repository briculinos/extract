import { useState, useCallback } from 'react';
import { Document, Page } from 'react-pdf';
import { Loader2, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from 'lucide-react';
import type { TextHighlight } from '../types';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

interface PDFViewerProps {
  url: string;
  highlights?: TextHighlight[];
  initialPage?: number;
  onPageChange?: (page: number) => void;
}

export function PDFViewer({ url, highlights = [], initialPage = 1, onPageChange }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(initialPage);
  const [scale, setScale] = useState<number>(1.0);
  const [isLoading, setIsLoading] = useState(true);

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setIsLoading(false);
    // Navigate to first highlight page if available
    if (highlights.length > 0 && highlights[0].page) {
      setPageNumber(highlights[0].page);
    }
  }, [highlights]);

  const goToPage = useCallback((page: number) => {
    const newPage = Math.max(1, Math.min(page, numPages));
    setPageNumber(newPage);
    onPageChange?.(newPage);
  }, [numPages, onPageChange]);

  // Get highlights for current page
  const currentPageHighlights = highlights.filter(h => h.page === pageNumber);

  // Custom text renderer for highlighting
  const customTextRenderer = useCallback(
    (textItem: { str: string }) => {
      if (currentPageHighlights.length === 0) {
        return textItem.str;
      }

      // Check if this text matches any highlight
      for (const highlight of currentPageHighlights) {
        if (highlight.text && textItem.str.toLowerCase().includes(highlight.text.toLowerCase())) {
          // Wrap matching text in a highlight span
          const regex = new RegExp(`(${escapeRegExp(highlight.text)})`, 'gi');
          return textItem.str.replace(regex, '<mark class="bg-yellow-300 rounded px-0.5">$1</mark>');
        }
        // Also check if the highlight text contains this text item
        if (highlight.text && highlight.text.toLowerCase().includes(textItem.str.toLowerCase())) {
          return `<mark class="bg-yellow-300 rounded px-0.5">${textItem.str}</mark>`;
        }
      }
      return textItem.str;
    },
    [currentPageHighlights]
  );

  return (
    <div className="flex flex-col h-full bg-gray-100">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b shadow-sm">
        <div className="flex items-center gap-2">
          <button
            onClick={() => goToPage(pageNumber - 1)}
            disabled={pageNumber <= 1}
            className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="text-sm text-gray-600 min-w-[100px] text-center">
            Page {pageNumber} of {numPages || '...'}
          </span>
          <button
            onClick={() => goToPage(pageNumber + 1)}
            disabled={pageNumber >= numPages}
            className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setScale(s => Math.max(0.5, s - 0.25))}
            disabled={scale <= 0.5}
            className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <ZoomOut size={20} />
          </button>
          <span className="text-sm text-gray-600 w-16 text-center">{Math.round(scale * 100)}%</span>
          <button
            onClick={() => setScale(s => Math.min(2.5, s + 0.25))}
            disabled={scale >= 2.5}
            className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <ZoomIn size={20} />
          </button>
        </div>
      </div>

      {/* PDF Content */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading && (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <span className="text-sm text-gray-500">Loading document...</span>
            </div>
          </div>
        )}
        <Document
          file={url}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={(error) => {
            console.error('PDF load error:', error);
            setIsLoading(false);
          }}
          loading={null}
          className="flex justify-center"
        >
          <Page
            pageNumber={pageNumber}
            scale={scale}
            renderTextLayer={true}
            renderAnnotationLayer={true}
            customTextRenderer={currentPageHighlights.length > 0 ? customTextRenderer : undefined}
            className="shadow-lg rounded-lg overflow-hidden"
          />
        </Document>
      </div>

      {/* Highlight Info Bar */}
      {currentPageHighlights.length > 0 && (
        <div className="px-4 py-2 bg-yellow-50 border-t border-yellow-200">
          <p className="text-sm text-yellow-800">
            <span className="font-medium">Highlighting:</span>{' '}
            {currentPageHighlights.map((h, i) => (
              <span key={i}>
                {i > 0 && ', '}
                <span className="bg-yellow-200 px-1 rounded">{h.fieldName}</span>
              </span>
            ))}
          </p>
        </div>
      )}
    </div>
  );
}

// Helper function to escape regex special characters
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
