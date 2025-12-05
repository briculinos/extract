export interface Document {
  id: string;
  filename: string;
  original_filename: string;
  content_type: string | null;
  file_size: number | null;
  source_type: string;
  source_url: string | null;
  created_at: string;
}

export interface Job {
  id: string;
  document_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  schema_name: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

// Citation from LlamaExtract API
export interface Citation {
  page: number;
  matching_text: string;
}

// Field citation with reasoning
export interface FieldCitation {
  reasoning?: string;
  citation: Citation[];
}

// For PDF viewer highlighting
export interface TextHighlight {
  page: number;
  text: string;
  fieldName: string;
}

export interface ExtractedData {
  id: string;
  document_id: string;
  schema_name: string;
  data: Record<string, unknown>;
  confidence_scores: Record<string, number> | null;
  citations: Record<string, FieldCitation | Citation[] | string> | null;
  created_at: string;
}

export interface SearchResult {
  document_id: string;
  filename: string;
  schema_name: string;
  data: Record<string, unknown>;
  relevance_score?: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatThread {
  id: string;
  title: string;
  messages: ChatMessage[];
  created_at: string;
  updated_at: string;
}

export interface Schema {
  name: string;
  description: string;
  fields: string[];
  isCustom?: boolean;
}

export interface UploadedFile {
  id: string;
  file: File | null;
  filename: string;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  documentId?: string;
  jobId?: string;
}
