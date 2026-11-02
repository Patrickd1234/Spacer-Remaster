import { Component } from "react";

// Catches a crash while rendering a page and shows a recovery screen instead
// of a blank page (React unmounts the whole tree on an uncaught render error).
// Error boundaries must be class components; there is no hook equivalent.
// App.jsx keys it by URL path, so navigating to another page clears the error.
export default class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        // Hook a monitoring service in here (e.g. Sentry) when one is added
        console.error("Page crashed:", error, info?.componentStack);
    }

    render() {
        if (!this.state.error) return this.props.children;

        return (
            <div role="alert" className="min-h-screen bg-panel flex items-center justify-center px-8">
                <div className="w-full max-w-[420px] text-center">
                    <span className="material-symbols-outlined text-[#f59e0b] text-[48px] mb-4">error</span>
                    <h1 className="text-[26px] font-bold text-white mb-2 tracking-tight">Something went wrong</h1>
                    <p className="text-muted text-[15px] mb-8 leading-relaxed">
                        This page hit an unexpected error. Your data is safe. Try reloading, or head back to the home page.
                    </p>
                    {/* Development only: the error itself, so a screenshot is enough to debug */}
                    {import.meta.env.DEV && (
                        <pre className="text-left text-xs text-red-400 bg-canvas border border-line rounded-lg p-3 mb-8 whitespace-pre-wrap break-words">
                            {String(this.state.error?.message || this.state.error)}
                        </pre>
                    )}
                    <div className="flex gap-3 justify-center">
                        <button
                            type="button"
                            onClick={() => window.location.reload()}
                            className="px-5 py-3 bg-accent hover:bg-accent-hover text-on-accent font-bold text-[14px] rounded-xl cursor-pointer"
                        >
                            Reload page
                        </button>
                        <a
                            href="/"
                            className="px-5 py-3 border border-line text-white hover:bg-surface1 font-semibold text-[14px] rounded-xl"
                        >
                            Go to home
                        </a>
                    </div>
                </div>
            </div>
        );
    }
}
