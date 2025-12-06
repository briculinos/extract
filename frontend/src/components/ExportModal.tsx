import { useState, useMemo } from 'react';
import { X } from 'lucide-react';
import type { ExtractedData, LineItem } from '../types';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ExtractedData[];
  columns: string[];
}

export function ExportModal({ isOpen, onClose, data, columns }: ExportModalProps) {
  const [filename, setFilename] = useState('data.xls');
  const [flattenLineItems, setFlattenLineItems] = useState(true);

  // Check if any data has line items
  const hasLineItems = useMemo(() => {
    return data.some((row) => {
      const lineItems = row.data.line_items;
      return Array.isArray(lineItems) && lineItems.length > 0;
    });
  }, [data]);

  // Get all unique line item field names
  const lineItemFields = useMemo(() => {
    const fields = new Set<string>();
    data.forEach((row) => {
      const lineItems = row.data.line_items as LineItem[] | undefined;
      if (Array.isArray(lineItems)) {
        lineItems.forEach((item) => {
          Object.keys(item).forEach((key) => fields.add(key));
        });
      }
    });
    // Prioritize common fields
    const priority = ['product_name', 'description', 'sku', 'quantity', 'unit_price', 'total_price', 'vat_rate', 'vat_amount'];
    const result = Array.from(fields);
    result.sort((a, b) => {
      const aIdx = priority.indexOf(a);
      const bIdx = priority.indexOf(b);
      if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
      if (aIdx === -1) return 1;
      if (bIdx === -1) return -1;
      return aIdx - bIdx;
    });
    return result;
  }, [data]);

  if (!isOpen) return null;

  const formatExportValue = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value).replace(/\t/g, ' ').replace(/\n/g, ' ');
  };

  const handleExport = () => {
    // Document-level columns (excluding line_items)
    const docColumns = columns.filter((col) => col !== 'line_items');

    let headers: string;
    let rows: string[];

    if (hasLineItems && flattenLineItems) {
      // Flattened export: one row per line item
      const allColumns = [...docColumns, ...lineItemFields.map((f) => `item_${f}`)];
      headers = allColumns.join('\t');

      rows = [];
      data.forEach((row) => {
        const docValues = docColumns.map((col) => formatExportValue(row.data[col]));
        const lineItems = row.data.line_items as LineItem[] | undefined;

        if (Array.isArray(lineItems) && lineItems.length > 0) {
          // Create one row per line item
          lineItems.forEach((item) => {
            const itemValues = lineItemFields.map((f) => formatExportValue(item[f]));
            rows.push([...docValues, ...itemValues].join('\t'));
          });
        } else {
          // No line items - still output document-level data with empty item columns
          const emptyItemValues = lineItemFields.map(() => '');
          rows.push([...docValues, ...emptyItemValues].join('\t'));
        }
      });
    } else {
      // Original non-flattened export
      headers = columns.join('\t');
      rows = data.map((row) =>
        columns
          .map((col) => formatExportValue(row.data[col]))
          .join('\t')
      );
    }

    const content = [headers, ...rows].join('\n');

    // Create and download file
    const blob = new Blob([content], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.xls') ? filename : `${filename}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-800">Export Data</h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm text-gray-600 mb-2">
              Enter the file name for download
            </label>
            <input
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="data.xls"
            />
          </div>

          {hasLineItems && (
            <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
              <input
                type="checkbox"
                id="flattenLineItems"
                checked={flattenLineItems}
                onChange={(e) => setFlattenLineItems(e.target.checked)}
                className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="flattenLineItems" className="text-sm">
                <span className="font-medium text-gray-800">Flatten line items</span>
                <p className="text-gray-600 mt-0.5">
                  Export one row per line item (recommended for Excel analysis).
                  Invoice fields will be repeated on each row.
                </p>
              </label>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
