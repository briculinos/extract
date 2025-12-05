import { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, Loader2, Trash2, Plus, Search, FileText, FileSpreadsheet, Image, CheckCircle, Clock, AlertCircle, FolderOpen } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { chatStream } from '../api/client';
import { useStore } from '../store/useStore';
import type { ChatThread } from '../types';

export function InsightsChat() {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [threadSearch, setThreadSearch] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    chatMessages,
    addChatMessage,
    clearChat,
    chatThreads,
    currentThreadId,
    addChatThread,
    updateChatThread,
    setCurrentThreadId,
    deleteChatThread,
    uploadedFiles,
  } = useStore();

  // Get file icon based on extension
  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext || '')) {
      return <Image className="w-4 h-4 text-blue-500" />;
    }
    if (['xlsx', 'xls', 'csv'].includes(ext || '')) {
      return <FileSpreadsheet className="w-4 h-4 text-green-500" />;
    }
    return <FileText className="w-4 h-4 text-red-500" />;
  };

  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-3 h-3 text-green-500" />;
      case 'pending':
      case 'uploading':
        return <Clock className="w-3 h-3 text-blue-500" />;
      case 'failed':
        return <AlertCircle className="w-3 h-3 text-red-500" />;
      default:
        return null;
    }
  };

  // Format file size
  const formatFileSize = (bytes: number | undefined) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Filter documents by search
  const [docSearch, setDocSearch] = useState('');
  const filteredDocs = uploadedFiles.filter((file) =>
    file.filename.toLowerCase().includes(docSearch.toLowerCase())
  );

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);

  const handleNewThread = () => {
    const newThread: ChatThread = {
      id: crypto.randomUUID(),
      title: 'New conversation',
      messages: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    addChatThread(newThread);
    clearChat();
  };

  const handleSelectThread = (threadId: string) => {
    // Save current thread messages before switching
    if (currentThreadId && chatMessages.length > 0) {
      updateChatThread(currentThreadId, chatMessages);
    }
    setCurrentThreadId(threadId);
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    // Create a new thread if none exists
    if (!currentThreadId) {
      const newThread: ChatThread = {
        id: crypto.randomUUID(),
        title: input.slice(0, 50),
        messages: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      addChatThread(newThread);
    }

    const userMessage = input.trim();
    setInput('');
    addChatMessage({ role: 'user', content: userMessage });
    setIsLoading(true);

    try {
      addChatMessage({ role: 'assistant', content: '' });

      let fullResponse = '';
      await chatStream(
        userMessage,
        chatMessages.map((m) => ({ role: m.role, content: m.content })),
        (chunk) => {
          fullResponse += chunk;
          useStore.setState((state) => {
            const messages = [...state.chatMessages];
            messages[messages.length - 1] = {
              role: 'assistant',
              content: fullResponse,
            };
            return { chatMessages: messages };
          });
        }
      );

      // Update thread title with first question if it's a new thread
      if (currentThreadId) {
        const thread = chatThreads.find((t) => t.id === currentThreadId);
        if (thread && thread.title === 'New conversation') {
          useStore.setState((state) => ({
            chatThreads: state.chatThreads.map((t) =>
              t.id === currentThreadId
                ? { ...t, title: userMessage.slice(0, 50) }
                : t
            ),
          }));
        }
      }
    } catch (error) {
      console.error('Chat failed:', error);
      addChatMessage({
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
      });
    } finally {
      setIsLoading(false);
      // Save messages to current thread
      if (currentThreadId) {
        setTimeout(() => {
          const state = useStore.getState();
          updateChatThread(currentThreadId, state.chatMessages);
        }, 100);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const filteredThreads = chatThreads.filter((thread) =>
    thread.title.toLowerCase().includes(threadSearch.toLowerCase())
  );

  return (
    <div className="h-[calc(100vh-80px)] flex">
      {/* Left Sidebar - Threads */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <button
            onClick={handleNewThread}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            <Plus size={18} />
            New Thread
          </button>
        </div>

        <div className="p-3 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={threadSearch}
              onChange={(e) => setThreadSearch(e.target.value)}
              placeholder="Search threads..."
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredThreads.length === 0 ? (
            <div className="p-4 text-center text-gray-500 text-sm">
              No threads yet
            </div>
          ) : (
            filteredThreads.map((thread) => (
              <div
                key={thread.id}
                onClick={() => handleSelectThread(thread.id)}
                className={`px-4 py-3 cursor-pointer border-b border-gray-100 hover:bg-gray-50 flex items-center justify-between group ${
                  currentThreadId === thread.id ? 'bg-blue-50' : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {thread.title}
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(thread.updated_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteChatThread(thread.id);
                  }}
                  className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Center - Chat Area */}
      <div className="flex-1 flex flex-col bg-gray-50">
        <div className="flex-1 overflow-y-auto p-6">
          {chatMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-500">
              <MessageSquare className="w-16 h-16 mb-4 text-gray-300" />
              <h2 className="text-xl font-semibold text-gray-700 mb-2">
                Welcome to Insights agents
              </h2>
              <p className="text-center max-w-md">
                Ask questions about your documents and I'll search through the extracted data to find insights.
              </p>
            </div>
          ) : (
            <div className="space-y-4 max-w-3xl mx-auto">
              {chatMessages.map((message, idx) => (
                <div
                  key={idx}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-3 ${
                      message.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-800 shadow-sm'
                    }`}
                  >
                    {message.role === 'assistant' ? (
                      <div className="prose prose-sm max-w-none">
                        {message.content ? (
                          <ReactMarkdown>{message.content}</ReactMarkdown>
                        ) : (
                          <div className="flex items-center gap-1">
                            <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                          </div>
                        )}
                      </div>
                    ) : (
                      <p>{message.content}</p>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="p-4 bg-white border-t border-gray-200">
          <div className="max-w-3xl mx-auto">
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your question here"
                  className="w-full px-4 py-3 border-2 border-blue-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isLoading}
                />
              </div>
              <button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send size={20} />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Right Sidebar - Available Documents */}
      <div className="w-72 bg-white border-l border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center gap-2 mb-3">
            <FolderOpen className="w-5 h-5 text-gray-600" />
            <h3 className="font-semibold text-gray-800">Documents</h3>
            <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
              {uploadedFiles.filter(f => f.status === 'completed').length}
            </span>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={docSearch}
              onChange={(e) => setDocSearch(e.target.value)}
              placeholder="Search files..."
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredDocs.length === 0 ? (
            <div className="p-6 text-center text-gray-400">
              <FileText className="w-10 h-10 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No documents available</p>
              <p className="text-xs mt-1">Upload documents to query them</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredDocs.map((file) => (
                <div
                  key={file.id}
                  className="px-4 py-3 hover:bg-gray-50 transition"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {getFileIcon(file.filename)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {file.filename}
                        </p>
                        {getStatusIcon(file.status)}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-400">
                          {file.file ? formatFileSize(file.file.size) : ''}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          file.status === 'completed'
                            ? 'bg-green-50 text-green-600'
                            : file.status === 'failed'
                            ? 'bg-red-50 text-red-600'
                            : 'bg-blue-50 text-blue-600'
                        }`}>
                          {file.status === 'completed' ? 'Ready' :
                           file.status === 'failed' ? 'Failed' : 'Processing'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Summary footer */}
        <div className="p-3 border-t border-gray-200 bg-gray-50">
          <p className="text-xs text-gray-500 text-center">
            {uploadedFiles.filter(f => f.status === 'completed').length} of {uploadedFiles.length} documents ready for insights
          </p>
        </div>
      </div>
    </div>
  );
}
