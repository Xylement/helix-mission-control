"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Attachment } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  Upload,
  Download,
  X,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  File as FileIcon,
  Loader2,
  Paperclip,
} from "lucide-react";
import { toast } from "sonner";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return <ImageIcon className="h-5 w-5 text-blue-500" />;
  if (mimeType === "application/pdf") return <FileText className="h-5 w-5 text-red-500" />;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType === "text/csv")
    return <FileSpreadsheet className="h-5 w-5 text-green-500" />;
  if (mimeType.includes("word") || mimeType.includes("document"))
    return <FileText className="h-5 w-5 text-blue-600" />;
  return <FileIcon className="h-5 w-5 text-gray-500" />;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function TaskAttachments({ taskId }: { taskId: number }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  const loadAttachments = useCallback(async () => {
    try {
      const res = await api.getAttachments(taskId);
      setAttachments(res.attachments);
    } catch {
      // silent
    }
  }, [taskId]);

  useEffect(() => {
    loadAttachments();
  }, [loadAttachments]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      await api.uploadAttachment(taskId, file);
      toast.success("File uploaded");
      loadAttachments();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  };

  const handleDelete = async (id: number) => {
    setDeleting(id);
    try {
      await api.deleteAttachment(id);
      toast.success("Attachment deleted");
      setAttachments((prev) => prev.filter((a) => a.id !== id));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(null);
    }
  };

  const handleDownload = (attachment: Attachment) => {
    const url = api.downloadAttachmentUrl(attachment.id);
    const token = localStorage.getItem("token");
    // Use fetch with auth header then trigger download
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((res) => res.blob())
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = attachment.filename;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => toast.error("Download failed"));
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
        <Paperclip className="h-4 w-4" /> Attachments ({attachments.length})
      </h3>

      {/* Upload zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer ${
          dragOver ? "border-blue-500 bg-blue-50" : "border-muted-foreground/25 hover:border-muted-foreground/50"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileSelect}
        />
        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Uploading...
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            <Upload className="h-5 w-5 mx-auto mb-1 opacity-50" />
            Drop files here or click to upload
            <div className="text-xs mt-1 opacity-75">Max 10MB per file</div>
          </div>
        )}
      </div>

      {/* File list */}
      {attachments.length > 0 && (
        <div className="space-y-2">
          {attachments.map((a) => {
            const isImage = a.mime_type.startsWith("image/");
            const canDelete = isAdmin || a.uploaded_by?.name === user?.name;
            return (
              <div
                key={a.id}
                className="flex items-center gap-3 p-2 rounded-md bg-muted/50 group"
              >
                {/* Thumbnail or icon */}
                {isImage ? (
                  <div
                    className="h-10 w-10 rounded overflow-hidden cursor-pointer flex-shrink-0 bg-muted"
                    onClick={() => setPreviewImage(api.downloadAttachmentUrl(a.id))}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={api.downloadAttachmentUrl(a.id)}
                      alt={a.filename}
                      className="h-full w-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  </div>
                ) : (
                  <div className="flex-shrink-0">{getFileIcon(a.mime_type)}</div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{a.filename}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatFileSize(a.file_size)} · {a.uploaded_by?.name || "Unknown"} · {timeAgo(a.created_at)}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleDownload(a)}>
                    <Download className="h-4 w-4" />
                  </Button>
                  {canDelete && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-destructive"
                      onClick={() => handleDelete(a.id)}
                      disabled={deleting === a.id}
                    >
                      {deleting === a.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <X className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Image Preview Modal */}
      <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent className="max-w-4xl p-2">
          {previewImage && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={previewImage}
              alt="Preview"
              className="w-full h-auto max-h-[80vh] object-contain rounded"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
