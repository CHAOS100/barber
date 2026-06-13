import { useEffect } from 'react';

const isEditableElement = (element) =>
  element instanceof HTMLInputElement
  || element instanceof HTMLTextAreaElement
  || element instanceof HTMLSelectElement;

export default function MobileViewportManager() {
  useEffect(() => {
    const viewport = window.visualViewport;
    const root = document.documentElement;

    const updateViewport = () => {
      const height = viewport?.height || window.innerHeight;
      const keyboardHeight = viewport ? Math.max(0, window.innerHeight - viewport.height) : 0;
      root.style.setProperty('--app-viewport-height', `${height}px`);
      root.style.setProperty('--keyboard-height', `${keyboardHeight}px`);
      root.classList.toggle('keyboard-open', keyboardHeight > 120);
    };

    const keepInputVisible = (event) => {
      if (!isEditableElement(event.target)) return;
      window.setTimeout(() => {
        event.target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      }, 250);
    };

    updateViewport();
    viewport?.addEventListener('resize', updateViewport);
    viewport?.addEventListener('scroll', updateViewport);
    window.addEventListener('resize', updateViewport);
    document.addEventListener('focusin', keepInputVisible);

    return () => {
      viewport?.removeEventListener('resize', updateViewport);
      viewport?.removeEventListener('scroll', updateViewport);
      window.removeEventListener('resize', updateViewport);
      document.removeEventListener('focusin', keepInputVisible);
      root.classList.remove('keyboard-open');
    };
  }, []);

  return null;
}
