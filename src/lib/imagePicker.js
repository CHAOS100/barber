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
    console.warn('[IMAGE_UPLOAD]', JSON.stringify({ context, event: 'missing-input-ref' }));
    return false;
  }
  console.info('[IMAGE_UPLOAD]', JSON.stringify({ context, event: 'input-click' }));
  input.click();
  return true;
};
