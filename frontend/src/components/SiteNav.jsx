import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Loader2, Menu, X } from "lucide-react";
import { useAppState } from "../state/AppState";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";

const LINKS = [
  { to: "/find", label: "Find a doctor" },
  { to: "/watchdog", label: "Watchdog" },
  { to: "/how-it-works", label: "How it works" },
];

/** One underline that slides to whichever page is open (hidden on pages that aren't in the menu). */
function useIndicator(pathname) {
  const navRef = useRef(null);
  const linkRefs = useRef({});
  const [box, setBox] = useState(null);

  useLayoutEffect(() => {
    const measure = () => {
      const active = LINKS.find((l) => pathname.startsWith(l.to));
      const el = active && linkRefs.current[active.to];
      if (!el || !navRef.current) return setBox((b) => (b ? { ...b, visible: false } : null));
      const nav = navRef.current.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      setBox({ left: r.left - nav.left + 12, width: r.width - 24, visible: true });
    };
    measure();
    // Fonts load after first paint and change link widths, so measure again then and on resize.
    document.fonts?.ready.then(measure);
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [pathname]);

  return { navRef, linkRefs, box };
}

export default function SiteNav() {
  const { watchCount, mission } = useAppState();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const running = mission.state.running;
  const { navRef, linkRefs, box } = useIndicator(pathname);

  useEffect(() => setOpen(false), [pathname]);

  const label = (l) => (
    <>
      {l.label}
      {l.to === "/watchdog" && watchCount > 0 && (
        <span key={watchCount} className="ml-1.5 inline-block animate-pop-in rounded-full bg-brand px-1.5 py-px text-[11px] font-semibold text-white">{watchCount}</span>
      )}
      {l.to === "/find" && running && <Loader2 className="ml-1.5 inline h-3.5 w-3.5 animate-spin text-pine-600" aria-label="search running" />}
    </>
  );

  return (
    <header className="sticky top-0 z-[1000] border-b border-slate-200/70 bg-paper/85 backdrop-blur-md transition-colors">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Link to="/" className="group flex items-center gap-2.5" aria-label="CareScout home">
          <Logo className="h-8 w-8 transition-transform duration-500 ease-flow group-hover:-rotate-6" />
          <span className="font-display text-xl font-bold tracking-tight text-ink">CareScout</span>
        </Link>

        <div className="flex items-center gap-1">
          <nav ref={navRef} className="relative hidden items-center gap-1 md:flex" aria-label="Main">
            {LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                ref={(el) => (linkRefs.current[l.to] = el)}
                className={({ isActive }) => `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isActive ? "text-ink" : "text-slate-500 hover:text-ink"}`}
              >
                {label(l)}
              </NavLink>
            ))}
            {box && (
              <span
                aria-hidden="true"
                className="absolute -bottom-[13px] h-0.5 rounded-full bg-pine-600 transition-all duration-500 ease-flow"
                style={{ left: box.left, width: box.width, opacity: box.visible ? 1 : 0 }}
              />
            )}
          </nav>
          <ThemeToggle className="md:ml-2" />
          {pathname !== "/find" && (
            <Link to="/find" className="btn-primary ml-2 hidden md:inline-flex">Start a search</Link>
          )}
          <button className="btn-ghost px-2 md:hidden" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={open ? "Close menu" : "Open menu"}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="animate-slide-down border-t border-slate-200/70 bg-paper md:hidden" aria-label="Main">
          <div className="container-page flex flex-col py-2">
            {LINKS.map((l, i) => (
              <NavLink
                key={l.to}
                to={l.to}
                style={{ animationDelay: `${60 + i * 50}ms` }}
                className={({ isActive }) => `animate-row-in rounded-lg px-3 py-3 text-base font-medium ${isActive ? "bg-accent/60 text-ink" : "text-slate-600"}`}
              >
                {label(l)}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
