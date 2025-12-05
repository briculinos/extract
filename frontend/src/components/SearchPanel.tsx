import { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { searchDocuments } from '../api/client';
import type { SearchResult } from '../types';

export function SearchPanel() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setIsSearching(true);
    setHasSearched(true);
    try {
      const response = await searchDocuments(query);
      setResults(response.results);
    } catch (error) {
      console.error('Search failed:', error);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800">Search Documents</h2>
      </div>
      <div className="p-4">
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search extracted data..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={isSearching || !query.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSearching ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Search size={18} />
            )}
            Search
          </button>
        </div>

        <div className="max-h-[300px] overflow-y-auto">
          {isSearching ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
          ) : results.length > 0 ? (
            <ul className="space-y-3">
              {results.map((result, idx) => (
                <li key={idx} className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-800 truncate">
                      {result.filename}
                    </span>
                    <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded">
                      {result.schema_name}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600">
                    {Object.entries(result.data)
                      .slice(0, 3)
                      .map(([key, value]) => (
                        <div key={key} className="truncate">
                          <span className="font-medium">{key}:</span>{' '}
                          {String(value)?.slice(0, 50)}
                          {String(value)?.length > 50 && '...'}
                        </div>
                      ))}
                  </div>
                </li>
              ))}
            </ul>
          ) : hasSearched ? (
            <div className="text-center py-8 text-gray-500">
              <Search className="w-10 h-10 mx-auto mb-2 text-gray-300" />
              <p>No results found</p>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Search className="w-10 h-10 mx-auto mb-2 text-gray-300" />
              <p>Enter a search query to find documents</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
