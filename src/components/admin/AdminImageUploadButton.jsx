import React, { useRef } from 'react';
import { Camera, Upload } from 'lucide-react';
import { PICKER_INPUT_STYLE, triggerFilePicker } from '@/lib/imagePicker';

const DEFAULT_ACCEPT = 'image/jpeg,image/jpg,image/png,image/webp';

export default function AdminImageUploadButton({
  label = 'הוסף תמונה',
  description = 'JPG, PNG או WEBP עד 10MB',
  context = 'admin-image-upload',
  disabled = false,
  accept = DEFAULT_ACCEPT,
  capture,
  icon: Icon = Upload,
  onFileSelected,
  className = '',
}) {
  const inputRef = useRef(null);

  const handlePointerDown = (event) => {
    if (disabled) return;
    event.preventDefault();
    triggerFilePicker(inputRef.current, context);
  };

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onPointerDown={handlePointerDown}
        className="w-full glass rounded-xl p-3 text-center cursor-pointer disabled:opacity-50 press-scale"
      >
        <Icon className="w-5 h-5 text-primary mx-auto mb-1" />
        <span className="text-sm font-bold">{label}</span>
        {description && (
          <span className="block text-xs text-muted-foreground mt-1">{description}</span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        capture={capture}
        style={PICKER_INPUT_STYLE}
        disabled={disabled}
        onChange={(event) => {
          onFileSelected?.(event.target.files?.[0] || null);
          event.target.value = '';
        }}
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
