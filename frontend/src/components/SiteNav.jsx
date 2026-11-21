import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Loader2, Menu, X } from "lucide-react";
import { useAppState } from "../state/AppState";
import Logo from "./Logo";

const LINKS = [
  { to: "/find", label: "Find a doctor" },
  { to: "/watchdog", label: "Watchdog" },
  { to: "/how-it-works", label: "How it works" },
];

export default function SiteNav() {
  const { watchCount, mission } = useAppState();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const running = mission.state.running;

  useEffect(() => setOpen(false), [pathname]);

  const linkClass = ({ isActive }) =>
    `relative rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? "text-ink" : "text-slate-500 hover:text-ink"}`;

  const label = (l) => (
    <>
      {l.label}
      {l.to === "/watchdog" && watchCount > 0 && (
        <span className="ml-1.5 rounded-full bg-pine-600 px-1.5 py-px text-[11px] font-semibold text-white">{watchCount}</span>
      )}
      {l.to === "/find" && running && <Loader2 className="ml-1.5 inline h-3.5 w-3.5 animate-spin text-pine-600" aria-label="search running" />}
    </>
  );

  return (
    <header className="sticky top-0 z-[1000] border-b border-slate-200/70 bg-paper/85 backdrop-blur-md">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2.5" aria-label="CareScout home">
          <Logo />
          <span className="font-display text-xl font-bold tracking-tight text-ink">CareScout</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} className={linkClass}>
              {({ isActive }) => (
                <>
                  {label(l)}
                  <span className={`absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-pine-600 transition-transform duration-300 ${isActive ? "scale-x-100" : "scale-x-0"}`} />
                </>
              )}
            </NavLink>
          ))}
          {pathname !== "/find" && (
            <Link to="/find" className="btn-primary ml-3">Start a search</Link>
          )}
        </nav>

        <button className="btn-ghost px-2 md:hidden" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={open ? "Close menu" : "Open menu"}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <nav className="animate-slide-down border-t border-slate-200/70 bg-paper md:hidden" aria-label="Main">
          <div className="container-page flex flex-col py-2">
            {LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} className={({ isActive }) => `rounded-lg px-3 py-3 text-base font-medium ${isActive ? "bg-mint/60 text-ink" : "text-slate-600"}`}>
                {label(l)}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
