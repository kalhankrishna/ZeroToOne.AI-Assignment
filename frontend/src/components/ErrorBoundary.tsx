import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="page-center">
          <h2>Something went wrong</h2>
          <p style={{ color: "#666", marginTop: "0.5rem" }}>
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <button
            style={{ marginTop: "1rem" }}
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.href = "/conversations";
            }}
          >
            Go Home
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}