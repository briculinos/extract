import { useState, useEffect, useMemo } from 'react';
import { FileText, MoreHorizontal, Trash2, Pencil, X, Check, Loader2, Maximize2 } from 'lucide-react';
import { useStore } from '../store/useStore';
import { getDocuments, getExtractedData } from '../api/client';
import { ExportModal } from './ExportModal';
import { DocumentPreviewModal } from './DocumentPreviewModal';
import { InlinePDFPreview } from './InlinePDFPreview';
import type { ExtractedData } from '../types';

export function ResultsPage() {
  const {
    setDocuments,
    uploadedFiles,
    setSelectedExtractedData,
    selectedSchema,
    schemas,
  } = useStore();

  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{
    rowId: string;
    field: string;
  } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [hoveredCell, setHoveredCell] = useState<{
    rowId: string;
    field: string;
  } | null>(null);
  const [allExtractedData, setAllExtractedData] = useState<ExtractedData[]>([]);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [previewDocumentId, setPreviewDocumentId] = useState<string | null>(null);
  const [activeHighlight, setActiveHighlight] = useState<{
    documentId: string;
    fieldName: string;
  } | null>(null);
  const [previewDocument, setPreviewDocument] = useState<{
    documentId: string;
    extractedData: ExtractedData;
  } | null>(null);

  // Check if there are files still processing
  const hasProcessingFiles = uploadedFiles.some(
    (f) => f.status === 'uploading' || f.status === 'pending'
  );

  // Load documents and their extracted data
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const docs = await getDocuments(50);
        setDocuments(docs);

        // Load extracted data for all completed files
        const completedDocIds = uploadedFiles
          .filter((f) => f.status === 'completed' && f.documentId)
          .map((f) => f.documentId!);

        const allData: ExtractedData[] = [];
        for (const docId of completedDocIds) {
          try {
            const data = await getExtractedData(docId);
            allData.push(...data);
          } catch (error) {
            console.error(`Failed to load data for ${docId}:`, error);
          }
        }
        setAllExtractedData(allData);
        setSelectedExtractedData(allData);
      } catch (error) {
        console.error('Failed to load documents:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [setDocuments, uploadedFiles, setSelectedExtractedData]);

  // Listen for export modal open event
  useEffect(() => {
    const handleOpenExport = () => setIsExportModalOpen(true);
    window.addEventListener('openExportModal', handleOpenExport);
    return () => window.removeEventListener('openExportModal', handleOpenExport);
  }, []);

  // Filter completed files
  const completedFiles = uploadedFiles.filter((f) => f.status === 'completed');

  // Get columns from the selected schema
  const columns = useMemo(() => {
    const schema = schemas.find((s) => s.name === selectedSchema);
    if (schema && schema.fields.length > 0) {
      return schema.fields;
    }
    // Fallback: derive from extracted data if no schema found
    const fields = new Set<string>();
    allExtractedData.forEach((data) => {
      Object.keys(data.data).forEach((key) => fields.add(key));
    });
    return Array.from(fields);
  }, [schemas, selectedSchema, allExtractedData]);

  // Build document info list and extracted data map for modal
  const { documentInfoList, extractedDataMap } = useMemo(() => {
    const docInfoList = completedFiles.map((file) => ({
      id: file.id,
      filename: file.filename,
      documentId: file.documentId!,
    })).filter((d) => d.documentId);

    const dataMap = new Map<string, ExtractedData>();
    allExtractedData.forEach((data) => {
      dataMap.set(data.document_id, data);
    });

    return { documentInfoList: docInfoList, extractedDataMap: dataMap };
  }, [completedFiles, allExtractedData]);

  // Get document ID for a given extracted data row
  const getDocumentIdForRow = (extractedId: string): string | null => {
    const data = allExtractedData.find((d) => d.id === extractedId);
    return data?.document_id || null;
  };

  // Handle opening preview modal
  const handleOpenPreview = (documentId: string) => {
    setPreviewDocumentId(documentId);
    setIsPreviewModalOpen(true);
  };

  // Handle hover on data cell - set active highlight and preview document
  const handleCellHover = (extractedId: string, field: string) => {
    const documentId = getDocumentIdForRow(extractedId);
    const extractedData = allExtractedData.find((d) => d.id === extractedId);
    if (documentId && extractedData) {
      setHoveredCell({ rowId: extractedId, field });
      setActiveHighlight({ documentId, fieldName: field });
      setPreviewDocument({ documentId, extractedData });
    }
  };

  const handleCellLeave = () => {
    setHoveredCell(null);
    // Keep the preview document but clear the highlight
    setActiveHighlight(null);
  };

  // Handle row hover - update preview document when entering a different row
  const handleRowHover = (extractedId: string) => {
    const documentId = getDocumentIdForRow(extractedId);
    const extractedData = allExtractedData.find((d) => d.id === extractedId);
    if (documentId && extractedData) {
      // Only update if it's a different document
      if (previewDocument?.documentId !== documentId) {
        setPreviewDocument({ documentId, extractedData });
      }
    }
  };

  const handleDelete = (extractedId: string) => {
    setAllExtractedData((prev) => prev.filter((d) => d.id !== extractedId));
    setActiveDropdown(null);
  };

  const handleEdit = (rowId: string, field: string, value: unknown) => {
    setEditingCell({ rowId, field });
    setEditValue(String(value ?? ''));
    setActiveDropdown(null);
  };

  const handleSaveEdit = () => {
    if (!editingCell) return;
    setAllExtractedData((prev) =>
      prev.map((data) =>
        data.id === editingCell.rowId
          ? {
              ...data,
              data: { ...data.data, [editingCell.field]: editValue },
            }
          : data
      )
    );
    setEditingCell(null);
    setEditValue('');
  };

  const handleCancelEdit = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left Panel - PDF Preview */}
          <div className="lg:col-span-2">
            <div className="sticky top-4">
              <div className="bg-white rounded-lg shadow-md overflow-hidden" style={{ height: '80vh', maxHeight: '700px' }}>
                {/* Header with expand button */}
                <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b">
                  <span className="text-sm font-medium text-gray-700 truncate">
                    {previewDocument
                      ? completedFiles.find((f) => f.documentId === previewDocument.documentId)?.filename || 'Document'
                      : 'Document Preview'}
                  </span>
                  {previewDocument && (
                    <button
                      onClick={() => handleOpenPreview(previewDocument.documentId)}
                      className="p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                      title="Open full preview"
                    >
                      <Maximize2 size={16} />
                    </button>
                  )}
                </div>

                {/* PDF Preview */}
                <div style={{ height: 'calc(100% - 44px)' }}>
                  <InlinePDFPreview
                    documentId={previewDocument?.documentId || (completedFiles[0]?.documentId ?? null)}
                    extractedData={previewDocument?.extractedData || (allExtractedData[0] ?? null)}
                    activeField={activeHighlight?.fieldName || null}
                    filename={
                      previewDocument
                        ? completedFiles.find((f) => f.documentId === previewDocument.documentId)?.filename
                        : completedFiles[0]?.filename
                    }
                  />
                </div>
              </div>

              {/* Document count badge */}
              {completedFiles.length > 1 && (
                <p className="text-center text-sm text-gray-500 mt-3">
                  Hover over table rows to preview different documents
                </p>
              )}
            </div>
          </div>

          {/* Right Panel - Data Table */}
          <div className="lg:col-span-3">
            {/* Processing indicator */}
            {hasProcessingFiles && (
              <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                <div>
                  <p className="text-sm font-medium text-blue-800">Processing documents...</p>
                  <p className="text-xs text-blue-600">
                    {uploadedFiles.filter((f) => f.status === 'pending').length} document(s) being extracted
                  </p>
                </div>
              </div>
            )}
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              {isLoading ? (
                <div className="p-8 text-center">
                  <Loader2 className="w-12 h-12 mx-auto mb-3 text-blue-500 animate-spin" />
                  <p className="text-gray-600">Loading extracted data...</p>
                </div>
              ) : allExtractedData.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>No extracted data available</p>
                  <p className="text-sm mt-1">Upload and process documents to see results</p>
                </div>
              ) : (
                <div className="overflow-auto max-h-[70vh]">
                  <table className="min-w-max w-full">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-gray-50 border-b border-gray-200">
                        {columns.map((col) => (
                          <th
                            key={col}
                            className="px-4 py-3 text-left text-sm font-semibold text-gray-700 whitespace-nowrap bg-gray-50"
                          >
                            {col.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                          </th>
                        ))}
                        <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700 whitespace-nowrap bg-gray-50">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {allExtractedData.map((extracted) => (
                        <tr
                          key={extracted.id}
                          className="border-b border-gray-100 hover:bg-gray-50"
                          onMouseEnter={() => handleRowHover(extracted.id)}
                        >
                          {columns.map((col) => {
                            const isEditing =
                              editingCell?.rowId === extracted.id &&
                              editingCell?.field === col;
                            const isHovered =
                              hoveredCell?.rowId === extracted.id &&
                              hoveredCell?.field === col;

                            return (
                              <td
                                key={col}
                                className={`px-4 py-3 text-sm text-gray-800 ${
                                  isHovered ? 'bg-blue-50' : ''
                                }`}
                                onMouseEnter={() => handleCellHover(extracted.id, col)}
                                onMouseLeave={handleCellLeave}
                              >
                                {isEditing ? (
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="text"
                                      value={editValue}
                                      onChange={(e) => setEditValue(e.target.value)}
                                      className="flex-1 px-2 py-1 border border-blue-500 rounded text-sm focus:outline-none"
                                      autoFocus
                                    />
                                    <button
                                      onClick={handleSaveEdit}
                                      className="p-1 text-green-600 hover:bg-green-50 rounded"
                                    >
                                      <Check size={16} />
                                    </button>
                                    <button
                                      onClick={handleCancelEdit}
                                      className="p-1 text-red-600 hover:bg-red-50 rounded"
                                    >
                                      <X size={16} />
                                    </button>
                                  </div>
                                ) : (
                                  <span
                                    className="cursor-pointer"
                                    onClick={() =>
                                      handleEdit(extracted.id, col, extracted.data[col])
                                    }
                                    title={
                                      extracted.citations?.[col]
                                        ? `Source: ${extracted.citations[col]}`
                                        : undefined
                                    }
                                  >
                                    {formatValue(extracted.data[col])}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-4 py-3 text-right relative">
                            <button
                              onClick={() =>
                                setActiveDropdown(
                                  activeDropdown === extracted.id ? null : extracted.id
                                )
                              }
                              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                            >
                              <MoreHorizontal size={18} />
                            </button>

                            {activeDropdown === extracted.id && (
                              <div className="absolute right-4 top-10 z-10 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-32">
                                <button
                                  onClick={() => handleDelete(extracted.id)}
                                  className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                                >
                                  <Trash2 size={14} />
                                  Delete
                                </button>
                                <button
                                  onClick={() => {
                                    const firstCol = columns[0];
                                    if (firstCol) {
                                      handleEdit(
                                        extracted.id,
                                        firstCol,
                                        extracted.data[firstCol]
                                      );
                                    }
                                  }}
                                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                >
                                  <Pencil size={14} />
                                  Edit
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        data={allExtractedData}
        columns={columns}
      />

      <DocumentPreviewModal
        isOpen={isPreviewModalOpen}
        onClose={() => {
          setIsPreviewModalOpen(false);
          setPreviewDocumentId(null);
        }}
        documents={documentInfoList}
        extractedDataMap={extractedDataMap}
        initialDocumentId={previewDocumentId || undefined}
        activeHighlight={activeHighlight}
      />
    </div>
  );
}
