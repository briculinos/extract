import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { LineItem } from '../types';

interface ExpandableLineItemsProps {
  lineItems: LineItem[];
  onItemHover?: (itemIndex: number, fieldName: string) => void;
  onItemLeave?: () => void;
}

export function ExpandableLineItems({
  lineItems,
  onItemHover,
  onItemLeave,
}: ExpandableLineItemsProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [displayLimit, setDisplayLimit] = useState(50);

  if (!lineItems || lineItems.length === 0) {
    return <span className="text-gray-400 italic">No items</span>;
  }

  // Get all unique keys from all line items
  const allKeys = new Set<string>();
  lineItems.forEach((item) => {
    Object.keys(item).forEach((key) => allKeys.add(key));
  });
  const columns = Array.from(allKeys);

  // Prioritize common fields first
  const priorityOrder = [
    'product_name',
    'description',
    'sku',
    'quantity',
    'unit_price',
    'total_price',
    'vat_rate',
    'vat_amount',
  ];
  columns.sort((a, b) => {
    const aIndex = priorityOrder.indexOf(a);
    const bIndex = priorityOrder.indexOf(b);
    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  const displayedItems = lineItems.slice(0, displayLimit);
  const hasMore = lineItems.length > displayLimit;

  const formatColumnName = (name: string) => {
    return name
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  return (
    <div className="w-full">
      {/* Collapsed summary */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4" />
        ) : (
          <ChevronRight className="w-4 h-4" />
        )}
        <span>
          {lineItems.length} line item{lineItems.length !== 1 ? 's' : ''}
        </span>
      </button>

      {/* Expanded table */}
      {isExpanded && (
        <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 bg-gray-50">
                    #
                  </th>
                  {columns.map((col) => (
                    <th
                      key={col}
                      className="px-3 py-2 text-left text-xs font-semibold text-gray-600 whitespace-nowrap bg-gray-50"
                    >
                      {formatColumnName(col)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayedItems.map((item, idx) => (
                  <tr
                    key={idx}
                    className="hover:bg-blue-50 transition-colors"
                    onMouseEnter={() => onItemHover?.(idx, 'line_items')}
                    onMouseLeave={() => onItemLeave?.()}
                  >
                    <td className="px-3 py-2 text-xs text-gray-400">{idx + 1}</td>
                    {columns.map((col) => (
                      <td
                        key={col}
                        className="px-3 py-2 text-sm text-gray-800 whitespace-nowrap max-w-xs truncate"
                        title={formatValue(item[col])}
                      >
                        {formatValue(item[col])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Load more button */}
          {hasMore && (
            <div className="px-3 py-2 bg-gray-50 border-t border-gray-200">
              <button
                onClick={() => setDisplayLimit((prev) => prev + 100)}
                className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
              >
                Load more ({lineItems.length - displayLimit} remaining)
              </button>
            </div>
          )}

          {/* Summary footer */}
          <div className="px-3 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-500">
            Showing {Math.min(displayLimit, lineItems.length)} of{' '}
            {lineItems.length} items
          </div>
        </div>
      )}
    </div>
  );
}
