import React, { useRef } from 'react';
import { Camera, Upload } from 'lucide-react';
import { PICKER_INPUT_STYLE, triggerFilePicker } from '@/lib/imagePicker';

const DEFAULT_ACCEPT = 'image/jpeg,image/jpg,image/png,image/webp';

export default function AdminImageUploadButton({
  label = 'הוסף תמונה',
  loadingLabel = 'מעלה תמונה...',
  description = 'JPG, PNG או WEBP עד 10MB',
  context = 'admin-image-upload',
  disabled = false,
  isUploading = false,
  accept = DEFAULT_ACCEPT,
  capture,
  icon: Icon = Upload,
  onFileSelected,
  className = '',
}) {
  const inputRef = useRef(null);
  const isDisabled = disabled || isUploading;
  const displayLabel = isUploading ? loadingLabel : label;

  const handlePointerDown = (event) => {
    if (isDisabled) return;
    event.preventDefault();
    triggerFilePicker(inputRef.current, context);
  };

  const handleChange = (event) => {
    const file = event.target.files?.[0] || null;
    if (file) {
      console.info('[IMAGE_UPLOAD]', JSON.stringify({
        context,
        event: 'file-selected',
        fileName: file.name,
        size: file.size,
        type: file.type || '(empty)',
      }));
    }
    onFileSelected?.(file);
    event.target.value = '';
  };

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        disabled={isDisabled}
        onPointerDown={handlePointerDown}
        className="w-full glass rounded-xl p-3 text-center cursor-pointer disabled:opacity-50 press-scale"
      >
        {isUploading ? (
          <div className="w-5 h-5 mx-auto mb-1 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        ) : (
          <Icon className="w-5 h-5 text-primary mx-auto mb-1" />
        )}
        <span className="text-sm font-bold">{displayLabel}</span>
        {description && !isUploading && (
          <span className="block text-xs text-muted-foreground mt-1">{description}</span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        capture={capture}
        style={PICKER_INPUT_STYLE}
        disabled={isDisabled}
        onChange={handleChange}
      />
    </div>
  );
}

export function AdminCameraUploadButton(props) {
  return (
    <AdminImageUploadButton
      {...props}
      icon={props.icon || Camera}
      capture={props.capture || 'environment'}
    />
  );
}
