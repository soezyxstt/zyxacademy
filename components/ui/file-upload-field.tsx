"use client";

import * as React from "react";
import { Upload, X, Check, File, FileImage, FileText } from "lucide-react";
import { FormFieldWrapper } from "@/components/ui/form-field-wrapper";
import { cn } from "@/lib/utils";

interface FileUploadFieldProps {
  label?: string;
  description?: string;
  error?: string;
  required?: boolean;
  accept?: string[]; // e.g. ['.pdf', '.png', 'image/*']
  maxSizeMB?: number; // Defaults to 5MB
  multiple?: boolean;
  onChange?: (files: File[]) => void;
  className?: string;
  id?: string;
}

interface FileWithProgress {
  id: string;
  file: File;
  progress: number;
  status: "uploading" | "success" | "error";
  errorMessage?: string;
}

function formatBytes(bytes: number, decimals = 1) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

function getFileIcon(type: string) {
  if (type.startsWith("image/")) {
    return <FileImage className="h-8 w-8 text-brand-secondary shrink-0" />;
  }
  if (type.includes("pdf") || type.includes("document") || type.includes("msword")) {
    return <FileText className="h-8 w-8 text-brand-primary shrink-0" />;
  }
  return <File className="h-8 w-8 text-muted-foreground shrink-0" />;
}

function FileUploadField({
  label,
  description,
  error: parentError,
  required,
  accept,
  maxSizeMB = 5,
  multiple = false,
  onChange,
  className,
  id,
}: FileUploadFieldProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [filesList, setFilesList] = React.useState<FileWithProgress[]>([]);
  const [localError, setLocalError] = React.useState<string | null>(null);
  
  const uniqueId = React.useId();
  const fieldId = id || uniqueId;
  const activeError = parentError || localError;

  // Cleanup simulation timers
  const timersRef = React.useRef<Record<string, NodeJS.Timeout>>({});
  React.useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      Object.values(timersRef.current).forEach(clearInterval);
    };
  }, []);

  const validateFile = (file: File): string | null => {
    // 1. Validate size
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      return `File ${file.name} exceeds the limit of ${maxSizeMB}MB.`;
    }

    // 2. Validate type/extension
    if (accept && accept.length > 0) {
      const extension = "." + file.name.split(".").pop()?.toLowerCase();
      const mimeType = file.type.toLowerCase();
      
      const isAccepted = accept.some((pattern) => {
        const pat = pattern.toLowerCase();
        if (pat.startsWith(".")) {
          return extension === pat;
        }
        if (pat.endsWith("/*")) {
          const group = pat.split("/")[0];
          return mimeType.startsWith(group + "/");
        }
        return mimeType === pat;
      });

      if (!isAccepted) {
        return `File ${file.name} type is not supported. Please upload: ${accept.join(", ")}`;
      }
    }

    return null;
  };

  const handleFiles = (newFiles: FileList | null) => {
    if (!newFiles || newFiles.length === 0) return;
    setLocalError(null);

    const validNewFiles: FileWithProgress[] = [];
    let validationFailed = false;

    // Check multiple vs single file support
    const filesToProcess = multiple ? Array.from(newFiles) : [newFiles[0]];

    for (const file of filesToProcess) {
      const validationError = validateFile(file);
      if (validationError) {
        setLocalError(validationError);
        validationFailed = true;
        break;
      }

      const fileId = `${file.name}-${file.size}-${Date.now()}`;
      validNewFiles.push({
        id: fileId,
        file,
        progress: 0,
        status: "uploading",
      });
    }

    if (validationFailed) return;

    // Update list
    setFilesList((prev) => {
      const updated = multiple ? [...prev, ...validNewFiles] : validNewFiles;
      if (onChange) {
        onChange(updated.map((f) => f.file));
      }
      return updated;
    });

    // Start simulated upload progress for each new file
    validNewFiles.forEach((newFile) => {
      simulateUpload(newFile.id);
    });
  };

  const simulateUpload = (fileId: string) => {
    const intervalTime = 150 + Math.random() * 200; // random speed

    const timer = setInterval(() => {
      setFilesList((prev) => {
        return prev.map((item) => {
          if (item.id === fileId) {
            if (item.progress >= 100) {
              clearInterval(timersRef.current[fileId]);
              return { ...item, progress: 100, status: "success" };
            }
            // Add random chunk
            const nextProgress = Math.min(item.progress + Math.floor(Math.random() * 15) + 5, 100);
            const status = nextProgress === 100 ? "success" : "uploading";
            return { ...item, progress: nextProgress, status };
          }
          return item;
        });
      });
    }, intervalTime);

    timersRef.current[fileId] = timer;
  };

  const removeFile = (fileId: string) => {
    if (timersRef.current[fileId]) {
      clearInterval(timersRef.current[fileId]);
      delete timersRef.current[fileId];
    }

    setFilesList((prev) => {
      const updated = prev.filter((item) => item.id !== fileId);
      if (onChange) {
        onChange(updated.map((f) => f.file));
      }
      return updated;
    });
  };

  // Drag handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
  };

  return (
    <FormFieldWrapper
      label={label}
      description={description}
      error={activeError || undefined}
      required={required}
      htmlFor={fieldId}
      className={className}
    >
      <input
        type="file"
        id={fieldId}
        ref={fileInputRef}
        onChange={handleFileInputChange}
        className="hidden"
        multiple={multiple}
        accept={accept?.join(",")}
        aria-invalid={!!activeError}
      />

      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={triggerFileInput}
        className={cn(
          "w-full border-2 border-dashed rounded-xl bg-card p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 outline-none",
          isDragging 
            ? "border-zx-accent bg-primary/5 scale-[1.01]" 
            : "border-border hover:border-border-strong hover:bg-muted/30",
          activeError ? "border-status-error bg-status-error/5" : "",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zx-accent focus-visible:ring-offset-2"
        )}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            triggerFileInput();
          }
        }}
        aria-label="Upload files by dragging and dropping here, or click to choose files"
      >
        <div className={cn(
          "mb-4 p-3 rounded-lg border border-border bg-background flex items-center justify-center transition-transform",
          isDragging && "scale-110 border-zx-accent text-zx-accent"
        )}>
          <Upload className="h-6 w-6 text-muted-foreground" />
        </div>

        <p className="font-heading text-body-base font-semibold tracking-tight mb-1">
          {isDragging ? "Drop your files here" : "Drag & drop files or click to browse"}
        </p>
        <p className="text-body-sm text-muted-foreground">
          {accept && accept.length > 0 
            ? `Supports ${accept.join(", ")} up to ${maxSizeMB}MB` 
            : `Supports any file up to ${maxSizeMB}MB`}
        </p>
      </div>

      {filesList.length > 0 && (
        <div className="mt-3 divide-y divide-border border border-border rounded-xl bg-card overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
          {filesList.map((item) => (
            <div key={item.id} className="p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {getFileIcon(item.file.type)}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-body-sm font-semibold truncate text-foreground">
                      {item.file.name}
                    </p>
                    <span className="text-body-xs text-muted-foreground shrink-0">
                      {formatBytes(item.file.size)}
                    </span>
                  </div>

                  {item.status === "uploading" && (
                    <div className="flex items-center gap-2">
                      {/* UI-STD Progress Bar */}
                      <div className="h-1.5 w-full rounded-md bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-md bg-primary transition-[width] duration-300 ease-out"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                      <span className="text-body-xs font-semibold text-muted-foreground shrink-0 w-8 text-right">
                        {item.progress}%
                      </span>
                    </div>
                  )}

                  {item.status === "success" && (
                    <div className="flex items-center gap-1.5 text-body-xs font-medium text-status-success">
                      <Check className="h-3.5 w-3.5" />
                      Uploaded successfully
                    </div>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(item.id);
                }}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-zx-accent transition-colors"
                title="Remove file"
                aria-label={`Remove ${item.file.name}`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </FormFieldWrapper>
  );
}

export { FileUploadField };
export type { FileUploadFieldProps, FileWithProgress };
