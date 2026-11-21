import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useAppState } from "../state/AppState";
import SiteNav from "./SiteNav";
import SiteFooter from "./SiteFooter";
import AlertBanner from "./AlertBanner";

/** Scroll to the top on page change (or to #anchor when the link has one). */
function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1));
      if (el) {
        el.scrollIntoView({ block: "start" });
        return;
      }
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

export default function Layout() {
  const { alert, setAlert } = useAppState();
  const { pathname } = useLocation();
  return (
    <div className="flex min-h-screen flex-col">
      <ScrollManager />
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[3000] focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <SiteNav />
      <AlertBanner alert={alert} onClose={() => setAlert(null)} />
      <main id="main" className="flex-1">
        {/* keyed by page, so each page arrives with a short rise instead of snapping in */}
        <div key={pathname} className="animate-page-in">
          <Outlet />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
