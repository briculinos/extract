import axios from 'axios';
import type { Document, Job, ExtractedData, SearchResult, Schema } from '../types';

const API_BASE = '/api/v1';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Document APIs
export const uploadDocument = async (file: File, schemaName: string = 'generic', customFields?: string[]) => {
  const formData = new FormData();
  formData.append('file', file);
  let url = `/documents/upload?schema_name=${schemaName}`;
  if (customFields && customFields.length > 0) {
    url += `&custom_fields=${encodeURIComponent(customFields.join(','))}`;
  }
  const response = await api.post(url, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const fetchFromUrl = async (url: string, schemaName: string = 'generic') => {
  const response = await api.post('/documents/fetch-url', { url, schema_name: schemaName });
  return response.data;
};

export const getDocuments = async (limit = 20, offset = 0): Promise<Document[]> => {
  const response = await api.get(`/documents?limit=${limit}&offset=${offset}`);
  return response.data;
};

export const getDocument = async (documentId: string): Promise<Document> => {
  const response = await api.get(`/documents/${documentId}`);
  return response.data;
};

export const getJobStatus = async (jobId: string): Promise<Job> => {
  const response = await api.get(`/jobs/${jobId}`);
  return response.data;
};

export const getExtractedData = async (documentId: string): Promise<ExtractedData[]> => {
  const response = await api.get(`/documents/${documentId}/extracted`);
  return response.data;
};

// Search API
export const searchDocuments = async (query: string, limit = 20, offset = 0): Promise<{
  results: SearchResult[];
  total: number;
  query: string;
}> => {
  const response = await api.post('/search', { query, limit, offset });
  return response.data;
};

export const semanticSearch = async (query: string, limit = 5) => {
  const response = await api.get(`/search/semantic?query=${encodeURIComponent(query)}&limit=${limit}`);
  return response.data;
};

// Chat API
export const chat = async (query: string, chatHistory: { role: string; content: string }[] = []): Promise<{ response: string }> => {
  const response = await api.post('/chat', { query, chat_history: chatHistory });
  return response.data;
};

export const chatStream = async (
  query: string,
  chatHistory: { role: string; content: string }[] = [],
  onChunk: (chunk: string) => void,
  documentIds?: string[]  // Filter to only these documents
) => {
  console.log('[chatStream] Sending request to /chat/stream with', documentIds?.length || 0, 'documents');

  const response = await fetch(`${API_BASE}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, chat_history: chatHistory, document_ids: documentIds }),
  });

  console.log('[chatStream] Response status:', response.status);

  // Check for errors before reading stream
  if (!response.ok) {
    const errorText = await response.text();
    console.error('[chatStream] Error response:', errorText);
    throw new Error(`Chat request failed: ${response.status} - ${errorText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body available');
  }

  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    console.log('[chatStream] Received chunk:', chunk.slice(0, 50));
    onChunk(chunk);
  }

  console.log('[chatStream] Stream completed');
};

// Schema API
export const getSchemas = async (): Promise<Schema[]> => {
  const response = await api.get('/schemas');
  return response.data;
};

// Document File API
export const getDocumentFileUrl = async (documentId: string): Promise<{
  url: string;
  content_type: string | null;
  filename: string;
}> => {
  const response = await api.get(`/documents/${documentId}/file`);
  return response.data;
};
