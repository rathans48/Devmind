"use client";

import { ImageIcon, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
} from "react";

export interface UploadedImage {
  base64: string;
  previewUrl: string;
  name: string;
  mimeType: string;
}

interface FileUploadProps {
  value: UploadedImage | null;
  onChange: (image: UploadedImage | null) => void;
  disabled?: boolean;
}

async function fileToUploadedImage(file: File): Promise<UploadedImage> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read image file"));
        return;
      }
      const [, encoded = result] = result.split(",");
      resolve(encoded);
    };
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.readAsDataURL(file);
  });

  return {
    base64,
    previewUrl: URL.createObjectURL(file),
    name: file.name || "pasted-screenshot.png",
    mimeType: file.type || "image/png",
  };
}

export default function FileUpload({
  value,
  onChange,
  disabled = false,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousPreviewRef = useRef<string | null>(null);

  useEffect(() => {
    if (
      previousPreviewRef.current &&
      previousPreviewRef.current !== value?.previewUrl
    ) {
      URL.revokeObjectURL(previousPreviewRef.current);
    }
    previousPreviewRef.current = value?.previewUrl ?? null;
  }, [value?.previewUrl]);

  useEffect(() => {
    return () => {
      if (previousPreviewRef.current) {
        URL.revokeObjectURL(previousPreviewRef.current);
      }
    };
  }, []);

  const handleFile = useCallback(
    async (file: File | null) => {
      if (!file || disabled) return;
      if (!file.type.startsWith("image/")) return;

      const uploaded = await fileToUploadedImage(file);
      onChange(uploaded);
    },
    [disabled, onChange],
  );

  const onDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      const file = event.dataTransfer.files?.[0] ?? null;
      await handleFile(file);
    },
    [handleFile],
  );

  const onPaste = useCallback(
    async (event: ClipboardEvent<HTMLDivElement>) => {
      if (disabled) return;

      const items = event.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith("image/")) {
          event.preventDefault();
          const file = item.getAsFile();
          await handleFile(file);
          break;
        }
      }
    },
    [disabled, handleFile],
  );

  const clearImage = useCallback(() => {
    onChange(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }, [onChange]);

  return (
    <div className="flex flex-col gap-3">
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setIsDragging(false);
        }}
        onDrop={onDrop}
        onPaste={onPaste}
        onClick={() => !disabled && inputRef.current?.click()}
        className={[
          "relative flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-4 py-6 text-center transition-colors",
          isDragging
            ? "border-emerald-400 bg-emerald-500/10"
            : "border-zinc-700 bg-zinc-900/60 hover:border-zinc-500 hover:bg-zinc-900",
          disabled ? "cursor-not-allowed opacity-50" : "",
        ].join(" ")}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          disabled={disabled}
          onChange={async (event) => {
            const file = event.target.files?.[0] ?? null;
            await handleFile(file);
          }}
        />

        <ImageIcon className="mb-2 h-6 w-6 text-zinc-400" aria-hidden />
        <p className="text-sm font-medium text-zinc-200">
          Drop a screenshot, click to browse, or paste from clipboard
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Attach execution errors for the debug agent
        </p>
      </div>

      {value && (
        <div className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-md border border-zinc-800 bg-zinc-900">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value.previewUrl}
              alt={value.name}
              className="h-full w-full object-cover"
            />
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-zinc-200">
              {value.name}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Base64 payload ready ({Math.round(value.base64.length / 1024)} KB)
            </p>
          </div>

          <button
            type="button"
            onClick={clearImage}
            disabled={disabled}
            aria-label="Remove uploaded screenshot"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-700 text-zinc-300 transition-colors hover:border-red-500/60 hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
