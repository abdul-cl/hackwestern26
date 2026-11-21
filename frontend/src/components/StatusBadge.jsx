import { STATUS_STYLE, displayStatus } from "../lib/clinics";

export default function StatusBadge({ clinic, status }) {
  const key = status || displayStatus(clinic);
  const style = STATUS_STYLE[key] || STATUS_STYLE.unknown;
  return (
    <span className={`badge ${style.badge}`}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: style.pin }} />
      {style.label}
    </span>
  );
}
