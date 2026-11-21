import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useAppState } from "../state/AppState";
import { ScrollTrigger, scrollToTarget, startSmoothScroll, stopSmoothScroll } from "../lib/motion";
import SiteNav from "./SiteNav";
import SiteFooter from "./SiteFooter";
import AlertBanner from "./AlertBanner";

/** Smooth scrolling (Lenis) for the whole site, started once. */
function SmoothScroll() {
  useEffect(() => {
    startSmoothScroll();
    return stopSmoothScroll;
  }, []);
  return null;
}

/** Jump to the top on page change (or to #anchor when the link has one). */
function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    const el = hash ? document.getElementById(hash.slice(1)) : null;
    if (el) {
      // let the new page lay out first, then glide to the section
      requestAnimationFrame(() => scrollToTarget(el));
      return;
    }
    scrollToTarget(0, { immediate: true, offset: 0 });
  }, [pathname, hash]);
  return null;
}

export default function Layout() {
  const { alert, setAlert } = useAppState();
  const { pathname } = useLocation();
  return (
    <div className="flex min-h-screen flex-col">
      <SmoothScroll />
      <ScrollManager />
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[3000] focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <SiteNav />
      <AlertBanner alert={alert} onClose={() => setAlert(null)} />
      <main id="main" className="flex-1">
        {/* keyed by page, so each page arrives with a short rise instead of snapping in. Scroll-linked animations
            measure positions once that rise has finished. */}
        <div key={pathname} className="animate-page-in" onAnimationEnd={(e) => e.target === e.currentTarget && ScrollTrigger.refresh()}>
          <Outlet />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
