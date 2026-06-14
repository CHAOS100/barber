import { useEffect } from 'react';

const isEditableElement = (element) =>
  element instanceof HTMLInputElement
  || element instanceof HTMLTextAreaElement
  || element instanceof HTMLSelectElement;

export default function MobileViewportManager() {
  useEffect(() => {
    const viewport = window.visualViewport;
    const root = document.documentElement;
    let animationFrame = 0;
    let stableHeight = window.innerHeight;

    const updateViewport = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        const visibleHeight = viewport?.height || stableHeight;
        const possibleKeyboardHeight = viewport
          ? Math.max(0, stableHeight - viewport.height - viewport.offsetTop)
          : 0;

        if (!isEditableElement(document.activeElement) || possibleKeyboardHeight <= 120) {
          stableHeight = window.innerHeight;
        }

        const keyboardHeight = viewport
          ? Math.max(0, stableHeight - viewport.height - viewport.offsetTop)
          : 0;

        root.style.setProperty('--app-viewport-height', `${stableHeight}px`);
        root.style.setProperty('--visible-viewport-height', `${visibleHeight}px`);
        root.style.setProperty('--keyboard-height', `${keyboardHeight}px`);
        root.classList.toggle('keyboard-open', keyboardHeight > 120);
      });
    };

    const keepInputVisible = (event) => {
      if (!isEditableElement(event.target)) return;

      window.setTimeout(() => {
        const element = event.target;
        const bounds = element.getBoundingClientRect();
        const visibleTop = viewport?.offsetTop || 0;
        const visibleBottom = visibleTop + (viewport?.height || window.innerHeight);
        const margin = 16;

        if (bounds.top < visibleTop + margin || bounds.bottom > visibleBottom - margin) {
          element.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        }
      }, 180);
    };

    updateViewport();
    viewport?.addEventListener('resize', updateViewport);
    window.addEventListener('resize', updateViewport);
    document.addEventListener('focusin', keepInputVisible);

    return () => {
      cancelAnimationFrame(animationFrame);
      viewport?.removeEventListener('resize', updateViewport);
      window.removeEventListener('resize', updateViewport);
      document.removeEventListener('focusin', keepInputVisible);
      root.classList.remove('keyboard-open');
    };
  }, []);

  return null;
}
