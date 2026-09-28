import { Component } from 'react';

/** Last-resort boundary: a render error shows a recoverable screen instead of a blank page. */
export class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[Dragonz Central] UI error:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="grid min-h-dvh place-items-center bg-ink-950 px-4 text-center">
        <div className="max-w-md">
          <p className="font-display text-6xl font-extrabold text-dragon-400">DRZ</p>
          <h1 className="mt-4 text-3xl font-bold">Something broke on this page</h1>
          <p className="mt-2 text-sm text-ink-300">It’s not you. Reload to try again — if it keeps happening, let the admins know.</p>
          <button type="button" onClick={() => window.location.reload()}
            className="mt-6 inline-flex h-11 items-center rounded-xl bg-dragon-400 px-6 font-semibold text-ink-950 hover:bg-dragon-300">
            Reload page
          </button>
        </div>
      </div>
    );
  }
}
