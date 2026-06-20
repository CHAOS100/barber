import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";

const getHashId = (hash) => {
  const rawId = hash.slice(1);

  try {
    return decodeURIComponent(rawId);
  } catch {
    return rawId;
  }
};

export default function ScrollToTop() {
  const { pathname, search, hash } = useLocation();

  useLayoutEffect(() => {
    const scrollRouteToTop = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      document
        .querySelectorAll("[data-route-scroll-root], .app-content")
        .forEach((element) => {
          element.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
          element.scrollTop = 0;
        });
    };

    if (hash) {
      const id = getHashId(hash);
      const timer = window.setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
      return () => window.clearTimeout(timer);
    }

    scrollRouteToTop();
    const firstFrame = window.requestAnimationFrame(scrollRouteToTop);
    const secondFrame = window.requestAnimationFrame(scrollRouteToTop);
    const timer = window.setTimeout(scrollRouteToTop, 80);

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.clearTimeout(timer);
    };
  }, [pathname, search, hash]);

  return null;
}
