import React, { useId } from 'react';
import { Camera, Upload } from 'lucide-react';
import { PICKER_INPUT_STYLE } from '@/lib/imagePicker';

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
  const inputId = useId();
  const isDisabled = disabled || isUploading;
  const displayLabel = isUploading ? loadingLabel : label;

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
      <label
        htmlFor={isDisabled ? undefined : inputId}
        aria-disabled={isDisabled}
        className={`w-full glass rounded-xl p-3 text-center block select-none ${
          isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer press-scale'
        }`}
        style={isDisabled ? { pointerEvents: 'none' } : undefined}
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
      </label>
      <input
        id={inputId}
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
