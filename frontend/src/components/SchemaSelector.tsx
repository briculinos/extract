import { useEffect, useState, useMemo, useCallback } from 'react';
import { Settings, Search, ChevronDown, Sparkles, Trash2 } from 'lucide-react';
import { getSchemas } from '../api/client';
import { useStore } from '../store/useStore';
import type { Schema } from '../types';

export function SchemaSelector() {
  const {
    schemas,
    setSchemas,
    selectedSchema,
    setSelectedSchema,
    customSchemaText,
    setCustomSchemaText,
    addCustomSchema,
    deleteCustomSchema,
  } = useStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [hasLoadedSchemas, setHasLoadedSchemas] = useState(false);
  const [customSchemaName, setCustomSchemaName] = useState('');

  // Memoize the schema loading function
  const loadSchemasFromApi = useCallback(async (existingCustomSchemas: Schema[]) => {
    try {
      const schemaList = await getSchemas();
      // Merge API schemas with custom schemas
      setSchemas([...schemaList, ...existingCustomSchemas]);
    } catch (error) {
      console.error('Failed to load schemas:', error);
    }
  }, [setSchemas]);

  useEffect(() => {
    // Prevent double loading
    if (hasLoadedSchemas) return;

    // Check if zustand persist has finished hydrating
    const checkAndLoad = () => {
      // Get current custom schemas from store (after hydration)
      const currentSchemas = useStore.getState().schemas;
      const customSchemas = currentSchemas.filter(s => s.isCustom);
      setHasLoadedSchemas(true);
      loadSchemasFromApi(customSchemas);
    };

    // If persist has already hydrated, load immediately
    if (useStore.persist.hasHydrated()) {
      checkAndLoad();
    } else {
      // Wait for hydration to complete
      const unsubscribe = useStore.persist.onFinishHydration(() => {
        checkAndLoad();
      });
      return () => unsubscribe();
    }
  }, [hasLoadedSchemas, loadSchemasFromApi]);

  const filteredSchemas = useMemo(() => {
    if (!searchQuery.trim()) return schemas;
    const query = searchQuery.toLowerCase();
    return schemas.filter(
      (schema) =>
        schema.name.toLowerCase().includes(query) ||
        schema.description.toLowerCase().includes(query)
    );
  }, [schemas, searchQuery]);

  const selectedSchemaData = schemas.find((s) => s.name === selectedSchema);

  const handleSelectSchema = (schemaName: string) => {
    setSelectedSchema(schemaName);
    setIsDropdownOpen(false);
    setSearchQuery('');
  };

  const handleCreateCustomSchema = () => {
    if (!customSchemaText.trim() || !customSchemaName.trim()) return;

    // Parse custom schema text - supports both newlines and commas as separators
    const fields = customSchemaText
      .split(/[\n,]+/)
      .map((field) => field.trim())
      .filter((field) => field.length > 0)
      .map((field) => field.replace(/\s+/g, '_').toLowerCase()); // Convert to snake_case for consistency

    console.log('[SchemaSelector] Creating custom schema with fields:', fields);

    if (fields.length === 0) return;

    // Use custom name, convert to snake_case for internal use
    const schemaName = customSchemaName.trim().replace(/\s+/g, '_').toLowerCase();

    // Check if schema with this name already exists
    const existingSchema = schemas.find(s => s.name === schemaName);
    if (existingSchema) {
      alert('A schema with this name already exists. Please choose a different name.');
      return;
    }

    const newSchema = {
      name: schemaName,
      description: customSchemaName.trim(), // Keep original name as description
      fields,
      isCustom: true,
    };

    console.log('[SchemaSelector] New schema:', newSchema);
    addCustomSchema(newSchema);
    setSelectedSchema(schemaName);
    console.log('[SchemaSelector] Selected schema set to:', schemaName);
    setCustomSchemaText('');
    setCustomSchemaName('');
  };

  const formatSchemaName = (name: string) => {
    return name
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center gap-2 mb-4">
        <Settings className="w-5 h-5 text-gray-600" />
        <h3 className="font-semibold text-gray-800">Extraction Schema</h3>
      </div>

      {/* Schema Dropdown with Search */}
      <div className="relative mb-4">
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg flex items-center justify-between text-left focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <span className="text-gray-800">
            {selectedSchemaData
              ? formatSchemaName(selectedSchemaData.name)
              : 'Select a schema'}
          </span>
          <ChevronDown
            className={`w-5 h-5 text-gray-400 transition-transform ${
              isDropdownOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {isDropdownOpen && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">
            {/* Search Input */}
            <div className="p-2 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search schemas..."
                  className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>

            {/* Schema List */}
            <div className="max-h-48 overflow-y-auto">
              {filteredSchemas.length === 0 ? (
                <div className="px-4 py-3 text-sm text-gray-500">
                  No schemas found
                </div>
              ) : (
                filteredSchemas.map((schema) => (
                  <div
                    key={schema.name}
                    className={`flex items-center justify-between hover:bg-gray-50 ${
                      selectedSchema === schema.name ? 'bg-blue-50' : ''
                    }`}
                  >
                    <button
                      onClick={() => handleSelectSchema(schema.name)}
                      className="flex-1 px-4 py-3 text-left flex items-center justify-between"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-800">
                          {formatSchemaName(schema.name)}
                        </p>
                        {schema.description && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            {schema.description}
                          </p>
                        )}
                      </div>
                      {schema.isCustom && (
                        <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-600 rounded">
                          Custom
                        </span>
                      )}
                    </button>
                    {schema.isCustom && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete "${formatSchemaName(schema.name)}" schema?`)) {
                            deleteCustomSchema(schema.name);
                          }
                        }}
                        className="px-3 py-3 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Delete schema"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Custom Schema Input */}
      <div className="border-t border-gray-100 pt-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-5 h-5 text-gray-600" />
          <h3 className="font-semibold text-gray-800">Create your own schema</h3>
        </div>
        <input
          type="text"
          value={customSchemaName}
          onChange={(e) => setCustomSchemaName(e.target.value)}
          placeholder="Schema name (e.g., My Invoice Schema)"
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm mb-3"
        />
        <textarea
          value={customSchemaText}
          onChange={(e) => setCustomSchemaText(e.target.value)}
          placeholder="Enter field names, one per line:&#10;product_name&#10;price&#10;description"
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-sm"
          rows={4}
        />
        {customSchemaText.trim() && customSchemaName.trim() && (
          <button
            onClick={handleCreateCustomSchema}
            className="mt-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition"
          >
            Save Schema
          </button>
        )}
      </div>
    </div>
  );
}
