// Catches render crashes inside dialogs so one bad modal can never blank
// the whole page. The fallback shows the actual error text (for diagnosis)
// with a working Close button.

import { Component, type ReactNode } from 'react';

export class ErrorBoundary extends Component<
  { children: ReactNode; title?: string; onClose?: () => void },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('Dialog crashed:', error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40" onClick={this.props.onClose} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <h2 className="text-sm font-bold text-red-700 uppercase tracking-wider">
              {this.props.title ?? 'Something went wrong in this dialog'}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              The page itself is fine — only this dialog failed. Copy the message below and share it.
            </p>
            <pre className="mt-3 text-xs font-mono bg-red-50 border border-red-200 rounded-lg p-3 whitespace-pre-wrap break-words text-red-800">
              {String(this.state.error?.message ?? this.state.error)}
            </pre>
            {this.props.onClose && (
              <div className="flex justify-end mt-4">
                <button
                  onClick={this.props.onClose}
                  className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-100 rounded"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
