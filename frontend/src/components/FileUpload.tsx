import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, Link, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { uploadDocument, fetchFromUrl, getJobStatus } from '../api/client';
import { useStore } from '../store/useStore';

export function FileUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const {
    updateJob,
    addDocument,
    uploadedFiles,
    addUploadedFile,
    updateUploadedFile,
  } = useStore();

  const pollJobStatus = useCallback(async (jobId: string, fileId: string) => {
    const poll = async () => {
      const job = await getJobStatus(jobId);
      updateJob(jobId, job);

      if (job.status === 'completed') {
        updateUploadedFile(fileId, { status: 'completed' });
      } else if (job.status === 'failed') {
        updateUploadedFile(fileId, { status: 'failed' });
      } else if (job.status === 'pending' || job.status === 'processing') {
        setTimeout(poll, 2000);
      }
    };
    poll();
  }, [updateJob, updateUploadedFile]);

  const handleUpload = useCallback(async (files: File[]) => {
    setIsUploading(true);

    // Get current values directly from store to avoid stale closures
    const currentState = useStore.getState();
    const currentSchema = currentState.selectedSchema;
    const currentSchemas = currentState.schemas;
    const schemaObj = currentSchemas.find(s => s.name === currentSchema);
    const customFields = schemaObj?.isCustom ? schemaObj.fields : undefined;

    console.log('[FileUpload] handleUpload - currentSchema:', currentSchema);
    console.log('[FileUpload] handleUpload - schemaObj:', schemaObj);
    console.log('[FileUpload] handleUpload - customFields:', customFields);

    try {
      for (const file of files) {
        const fileId = crypto.randomUUID();
        addUploadedFile({
          id: fileId,
          file,
          filename: file.name,
          status: 'uploading',
        });

        try {
          const result = await uploadDocument(file, currentSchema, customFields);
          addDocument({
            id: result.document_id,
            filename: result.filename,
            original_filename: result.filename,
            content_type: file.type,
            file_size: file.size,
            source_type: 'upload',
            source_url: null,
            created_at: new Date().toISOString(),
          });
          updateUploadedFile(fileId, {
            status: 'pending',
            documentId: result.document_id,
            jobId: result.job_id,
          });
          pollJobStatus(result.job_id, fileId);
        } catch (error) {
          console.error('Upload failed:', error);
          updateUploadedFile(fileId, { status: 'failed' });
        }
      }
    } finally {
      setIsUploading(false);
    }
  }, [addDocument, pollJobStatus, addUploadedFile, updateUploadedFile]);

  const handleUrlFetch = async () => {
    if (!urlInput.trim()) return;
    setIsUploading(true);

    const currentSchema = useStore.getState().selectedSchema;

    const fileId = crypto.randomUUID();
    const urlFilename = urlInput.split('/').pop() || 'document';
    addUploadedFile({
      id: fileId,
      file: undefined,
      filename: urlFilename,
      status: 'uploading',
    });

    try {
      const result = await fetchFromUrl(urlInput, currentSchema);
      addDocument({
        id: result.document_id,
        filename: result.filename,
        original_filename: result.filename,
        content_type: null,
        file_size: null,
        source_type: 'api_endpoint',
        source_url: urlInput,
        created_at: new Date().toISOString(),
      });
      updateUploadedFile(fileId, {
        status: 'pending',
        documentId: result.document_id,
        jobId: result.job_id,
      });
      pollJobStatus(result.job_id, fileId);
      setUrlInput('');
    } catch (error) {
      console.error('URL fetch failed:', error);
      updateUploadedFile(fileId, { status: 'failed' });
    } finally {
      setIsUploading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleUpload,
    accept: {
      'application/pdf': ['.pdf'],
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
      'text/*': ['.txt', '.csv', '.json'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    },
    disabled: isUploading,
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'uploading':
      case 'pending':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      default:
        return null;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Completed!';
      case 'failed':
        return 'Failed';
      case 'uploading':
        return 'Uploading...';
      case 'pending':
        return 'Processing...';
      default:
        return '';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition ${
            isDragActive
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
          } ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <input {...getInputProps()} />
          {isUploading ? (
            <div className="flex flex-col items-center">
              <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-3" />
              <p className="text-gray-600">Uploading...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <Upload className="w-10 h-10 text-gray-400 mb-3" />
              {isDragActive ? (
                <p className="text-blue-600 font-medium">Drop files here...</p>
              ) : (
                <>
                  <p className="text-gray-600 font-medium mb-1">
                    Drag & drop files here
                  </p>
                  <p className="text-gray-400 text-sm mb-3">
                    Supports PDF, images, text files, DOCX, XLSX
                  </p>
                  <span className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium">
                    Browse Files
                  </span>
                </>
              )}
            </div>
          )}
        </div>

      {/* From URL Section */}
      <div className="mt-4 pt-4 border-t border-gray-100">
        <p className="text-sm text-gray-600 mb-2 flex items-center gap-2">
          <Link size={14} />
          Or fetch from URL
        </p>
        <div className="flex gap-2">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="Enter document URL"
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isUploading}
            onKeyDown={(e) => e.key === 'Enter' && handleUrlFetch()}
          />
          <button
            onClick={handleUrlFetch}
            disabled={isUploading || !urlInput.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
          >
            {isUploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Link size={14} />
            )}
            Fetch
          </button>
        </div>
      </div>

      {/* Uploaded Files List */}
      {uploadedFiles.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-4">
          <p className="text-sm text-gray-600 mb-2">Uploaded documents:</p>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {uploadedFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="text-sm text-gray-700 truncate">
                    {file.filename}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    className={`text-xs font-medium ${
                      file.status === 'completed'
                        ? 'text-green-600'
                        : file.status === 'failed'
                        ? 'text-red-600'
                        : 'text-blue-600'
                    }`}
                  >
                    {getStatusText(file.status)}
                  </span>
                  {getStatusIcon(file.status)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
