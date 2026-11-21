import { Component } from "react";
import { AlertTriangle } from "lucide-react";

/** Contains a rendering error to one part of the page instead of blanking the whole app. */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("CareScout UI error:", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card flex items-start gap-2 p-4 text-sm text-rose-700">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <div className="font-medium">{this.props.label || "This part of the page"} couldn't be displayed.</div>
          <button className="mt-1 text-xs underline" onClick={() => this.setState({ error: null })}>Try again</button>
        </div>
      </div>
    );
  }
}
