/** CareScout mark: a pulse line that turns into a search path. */
export default function Logo({ className = "h-8 w-8" }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="9" className="fill-pine-600" />
      <path d="M7 17h4.2l2.3-5.5 3.2 9.5 2.2-4.5H22" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="24.2" cy="16.5" r="1.9" className="fill-mint" />
    </svg>
  );
}
