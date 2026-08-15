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
    const pendingTimers = new Set();

    const schedule = (callback, delay) => {
      const timer = window.setTimeout(() => {
        pendingTimers.delete(timer);
        callback();
      }, delay);
      pendingTimers.add(timer);
    };

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
        root.style.setProperty('--visual-viewport-offset-top', `${viewport?.offsetTop || 0}px`);
        root.style.setProperty('--keyboard-height', `${keyboardHeight}px`);
        root.classList.toggle('keyboard-open', keyboardHeight > 120);
      });
    };

    const keepElementVisible = (element) => {
      if (!isEditableElement(element) || !element.isConnected) return;
      const bounds = element.getBoundingClientRect();
      const visibleTop = viewport?.offsetTop || 0;
      const visibleBottom = visibleTop + (viewport?.height || window.innerHeight);
      const margin = 16;

      if (bounds.top < visibleTop + margin || bounds.bottom > visibleBottom - margin) {
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }
    };

    const keepInputVisible = (event) => {
      if (!isEditableElement(event.target)) return;
      const element = event.target;
      [120, 320].forEach((delay) => schedule(() => {
        updateViewport();
        const bounds = element.getBoundingClientRect();
        if (bounds.width > 0 || bounds.height > 0) keepElementVisible(element);
      }, delay));
    };

    const handleFocusOut = () => schedule(updateViewport, 180);

    const resetStableViewport = () => schedule(() => {
      stableHeight = window.innerHeight;
      updateViewport();
    }, 250);

    updateViewport();
    viewport?.addEventListener('resize', updateViewport);
    viewport?.addEventListener('scroll', updateViewport);
    window.addEventListener('resize', updateViewport);
    window.addEventListener('orientationchange', resetStableViewport);
    document.addEventListener('focusin', keepInputVisible);
    document.addEventListener('focusout', handleFocusOut);

    return () => {
      cancelAnimationFrame(animationFrame);
      viewport?.removeEventListener('resize', updateViewport);
      viewport?.removeEventListener('scroll', updateViewport);
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('orientationchange', resetStableViewport);
      document.removeEventListener('focusin', keepInputVisible);
      document.removeEventListener('focusout', handleFocusOut);
      pendingTimers.forEach((timer) => window.clearTimeout(timer));
      root.classList.remove('keyboard-open');
    };
  }, []);

  return null;
}
