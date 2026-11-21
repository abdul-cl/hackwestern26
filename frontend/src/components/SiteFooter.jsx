import { Link } from "react-router-dom";
import Logo from "./Logo";

export default function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-slate-200 bg-white">
      <div className="container-page grid gap-8 py-10 text-sm md:grid-cols-[1.4fr,1fr,1fr]">
        <div className="max-w-sm">
          <div className="flex items-center gap-2">
            <Logo className="h-7 w-7" />
            <span className="font-display text-lg font-bold text-ink">CareScout</span>
          </div>
          <p className="mt-3 text-slate-500">
            CareScout reads public clinic websites to help you find a family doctor. It doesn't give medical advice.
          </p>
          <p className="mt-2 text-slate-500">
            In an emergency, call 911. For health advice any time, call Health811.
          </p>
        </div>
        <div>
          <div className="font-semibold text-ink">Use CareScout</div>
          <ul className="mt-3 space-y-2 text-slate-500">
            <li><Link to="/find" className="hover:text-ink">Find a doctor</Link></li>
            <li><Link to="/watchdog" className="hover:text-ink">Watch full clinics</Link></li>
            <li><Link to="/find?demo=1" className="hover:text-ink">Try the demo</Link></li>
          </ul>
        </div>
        <div>
          <div className="font-semibold text-ink">Learn more</div>
          <ul className="mt-3 space-y-2 text-slate-500">
            <li><Link to="/how-it-works" className="hover:text-ink">How it works</Link></li>
            <li><Link to="/how-it-works#safety" className="hover:text-ink">Privacy and safety</Link></li>
            <li><a href="https://register.cpso.on.ca/" target="_blank" rel="noreferrer" className="hover:text-ink">CPSO physician register</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-100">
        <div className="container-page flex flex-wrap justify-between gap-2 py-4 text-xs text-slate-400">
          <span>Built at Hack Western for patients across Ontario.</span>
          <span>Map data from OpenStreetMap contributors.</span>
        </div>
      </div>
    </footer>
  );
}
