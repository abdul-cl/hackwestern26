import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="container-page py-24 text-center">
      <h1 className="text-4xl font-bold tracking-tight">This page doesn't exist</h1>
      <p className="mt-3 text-slate-500">The link may be old or mistyped.</p>
      <div className="mt-8 flex justify-center gap-3">
        <Link to="/" className="btn-secondary">Go to the home page</Link>
        <Link to="/find" className="btn-primary">Find a doctor</Link>
      </div>
    </div>
  );
}
