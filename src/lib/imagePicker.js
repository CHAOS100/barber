export const PICKER_INPUT_STYLE = {
  position: 'absolute',
  width: 1,
  height: 1,
  opacity: 0,
  overflow: 'hidden',
  pointerEvents: 'none',
  insetInlineStart: 0,
  insetBlockStart: 0,
};

export const triggerFilePicker = (input, context = 'image-picker') => {
  if (!input) {
    console.warn('[Image Picker]', JSON.stringify({ context, event: 'missing-input-ref' }));
    return false;
  }
  input.click();
  return true;
};
