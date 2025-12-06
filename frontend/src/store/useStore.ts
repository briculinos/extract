import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Document, Job, ExtractedData, ChatMessage, Schema, ChatThread, UploadedFile } from '../types';

interface AppState {
  // Documents
  documents: Document[];
  setDocuments: (docs: Document[]) => void;
  addDocument: (doc: Document) => void;
  removeDocument: (docId: string) => void;

  // Uploaded files (for upload page display)
  uploadedFiles: UploadedFile[];
  addUploadedFile: (file: UploadedFile) => void;
  updateUploadedFile: (id: string, updates: Partial<UploadedFile>) => void;
  clearUploadedFiles: () => void;

  // Jobs
  activeJobs: Map<string, Job>;
  updateJob: (jobId: string, job: Job) => void;
  removeJob: (jobId: string) => void;

  // Selected document
  selectedDocumentId: string | null;
  setSelectedDocumentId: (id: string | null) => void;
  selectedExtractedData: ExtractedData[];
  setSelectedExtractedData: (data: ExtractedData[]) => void;

  // Chat
  chatMessages: ChatMessage[];
  addChatMessage: (message: ChatMessage) => void;
  clearChat: () => void;

  // Chat Threads
  chatThreads: ChatThread[];
  currentThreadId: string | null;
  addChatThread: (thread: ChatThread) => void;
  updateChatThread: (threadId: string, messages: ChatMessage[]) => void;
  setCurrentThreadId: (threadId: string | null) => void;
  deleteChatThread: (threadId: string) => void;

  // Schemas
  schemas: Schema[];
  setSchemas: (schemas: Schema[]) => void;
  addCustomSchema: (schema: Schema) => void;
  deleteCustomSchema: (schemaName: string) => void;
  selectedSchema: string;
  setSelectedSchema: (schema: string) => void;
  customSchemaText: string;
  setCustomSchemaText: (text: string) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      // Documents
      documents: [],
      setDocuments: (docs) => set({ documents: docs }),
      addDocument: (doc) => set((state) => ({ documents: [doc, ...state.documents] })),
      removeDocument: (docId) => set((state) => ({
        documents: state.documents.filter(d => d.id !== docId)
      })),

      // Uploaded files
      uploadedFiles: [],
      addUploadedFile: (file) => set((state) => ({
        uploadedFiles: [...state.uploadedFiles, file]
      })),
      updateUploadedFile: (id, updates) => set((state) => ({
        uploadedFiles: state.uploadedFiles.map(f =>
          f.id === id ? { ...f, ...updates } : f
        )
      })),
      clearUploadedFiles: () => set({ uploadedFiles: [] }),

      // Jobs
      activeJobs: new Map(),
      updateJob: (jobId, job) =>
        set((state) => {
          const newJobs = new Map(state.activeJobs);
          newJobs.set(jobId, job);
          return { activeJobs: newJobs };
        }),
      removeJob: (jobId) =>
        set((state) => {
          const newJobs = new Map(state.activeJobs);
          newJobs.delete(jobId);
          return { activeJobs: newJobs };
        }),

      // Selected document
      selectedDocumentId: null,
      setSelectedDocumentId: (id) => set({ selectedDocumentId: id }),
      selectedExtractedData: [],
      setSelectedExtractedData: (data) => set({ selectedExtractedData: data }),

      // Chat
      chatMessages: [],
      addChatMessage: (message) =>
        set((state) => ({ chatMessages: [...state.chatMessages, message] })),
      clearChat: () => set({ chatMessages: [] }),

      // Chat Threads
      chatThreads: [],
      currentThreadId: null,
      addChatThread: (thread) => set((state) => ({
        chatThreads: [thread, ...state.chatThreads],
        currentThreadId: thread.id,
        chatMessages: thread.messages
      })),
      updateChatThread: (threadId, messages) => set((state) => ({
        chatThreads: state.chatThreads.map(t =>
          t.id === threadId
            ? { ...t, messages, updated_at: new Date().toISOString() }
            : t
        )
      })),
      setCurrentThreadId: (threadId) => set((state) => {
        const thread = state.chatThreads.find(t => t.id === threadId);
        return {
          currentThreadId: threadId,
          chatMessages: thread?.messages || []
        };
      }),
      deleteChatThread: (threadId) => set((state) => ({
        chatThreads: state.chatThreads.filter(t => t.id !== threadId),
        currentThreadId: state.currentThreadId === threadId ? null : state.currentThreadId,
        chatMessages: state.currentThreadId === threadId ? [] : state.chatMessages
      })),

      // Schemas
      schemas: [],
      setSchemas: (schemas) => set({ schemas }),
      addCustomSchema: (schema) => set((state) => ({
        schemas: [...state.schemas, { ...schema, isCustom: true }]
      })),
      deleteCustomSchema: (schemaName) => set((state) => ({
        schemas: state.schemas.filter(s => s.name !== schemaName),
        // Reset to generic if the deleted schema was selected
        selectedSchema: state.selectedSchema === schemaName ? 'generic' : state.selectedSchema
      })),
      selectedSchema: 'generic',
      setSelectedSchema: (schema) => set({ selectedSchema: schema }),
      customSchemaText: '',
      setCustomSchemaText: (text) => set({ customSchemaText: text }),
    }),
    {
      name: 'extract-storage',
      partialize: (state) => ({
        chatThreads: state.chatThreads,
        schemas: state.schemas.filter(s => s.isCustom),
        selectedSchema: state.selectedSchema,
      }),
    }
  )
);
