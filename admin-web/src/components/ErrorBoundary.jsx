import { Component } from 'react';
import { TriangleAlert, RefreshCw } from 'lucide-react';

/**
 * Catches errors while drawing a page so the owner sees a friendly message
 * (with a way to recover) instead of a blank screen.
 * Pass `resetKey` (e.g. the current path) to clear the error when navigating away.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[page error]', error, info?.componentStack);
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex flex-col items-center justify-center px-4 py-16 text-center" role="alert">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <TriangleAlert className="h-7 w-7" aria-hidden />
        </div>
        <h2 className="text-lg font-semibold text-slate-800">This page couldn&apos;t be shown</h2>
        <p className="mt-1 max-w-md text-sm text-slate-500">
          Something went wrong while loading it. Please try again. If it keeps happening, restart the backend server (it may be running an older version).
        </p>
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={() => this.setState({ error: null })} className="inline-flex items-center gap-2 rounded-lg bg-navy-700 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800">
            <RefreshCw className="h-4 w-4" aria-hidden /> Try again
          </button>
          <button type="button" onClick={() => window.location.reload()} className="rounded-lg border border-slate-300 bg-panel px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Reload page
          </button>
        </div>
      </div>
    );
  }
}
