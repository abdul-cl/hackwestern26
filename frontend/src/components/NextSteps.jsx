import { ExternalLink, Phone } from "lucide-react";

// Official and community routes to a family doctor in Ontario / London. Kept short and factual: each line says who it's for.
const ROUTES = [
  {
    name: "Health Care Connect",
    who: "Ontario's own waitlist. It matches you with a family doctor or nurse practitioner taking patients. You need your health card number, postal code and phone number. Register online, or by phone through 811.",
    phone: "811",
    url: "https://www.ontario.ca/page/health-care-connect-find-family-doctor-or-nurse-practitioner",
    action: "Register online",
  },
  {
    name: "London InterCommunity Health Centre",
    who: "Health care in London for people who face barriers to care, such as poverty, homelessness, language or culture.",
    url: "https://lihc.on.ca/",
    action: "Visit",
  },
  {
    name: "London & District Academy of Medicine",
    who: "Keeps a list of London doctors who have said they're taking new patients.",
    url: "https://www.ldam.ca/find-a-doctor",
    action: "See the list",
  },
  {
    name: "Health811",
    who: "Free health advice from a registered nurse, any time, while you're still looking.",
    phone: "811",
    url: "https://health811.ontario.ca/",
    action: "Visit",
  },
];

/** "No luck? Also try these": the official routes that run alongside a CareScout search. */
export default function NextSteps() {
  return (
    <section className="card animate-card-in p-5" aria-labelledby="next-steps-title">
      <h2 id="next-steps-title" className="text-lg font-bold">No luck yet? Also try these</h2>
      <p className="mt-1 text-sm text-slate-500">They work alongside CareScout. It's worth doing all of them while you wait.</p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {ROUTES.map((r) => (
          <li key={r.name} className="flex flex-col rounded-xl bg-slate-50 p-4">
            <div className="font-semibold text-ink">{r.name}</div>
            <p className="mt-1 flex-1 text-sm text-slate-600">{r.who}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {r.phone && (
                <a href={`tel:${r.phone.replace(/[^\d]/g, "")}`} className="btn-secondary py-1.5">
                  <Phone className="h-4 w-4" /> {r.phone}
                </a>
              )}
              <a href={r.url} target="_blank" rel="noreferrer" className="btn-ghost py-1.5">
                {r.action} <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
