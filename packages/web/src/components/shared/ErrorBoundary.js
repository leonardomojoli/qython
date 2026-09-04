// frontend/src/components/shared/ErrorBoundary.js
//
// Render-time crash containment. React has no hook equivalent for error
// boundaries, so this stays a class component. Without a boundary, a single
// throw during render (e.g. dereferencing a field the API didn't send) unmounts
// the whole tree and leaves a blank white screen. This converts that into a
// contained, recoverable fallback.
//
// Usage:
//   <ErrorBoundary fallback={<MyFallback />}>...</ErrorBoundary>
//   <ErrorBoundary>...</ErrorBoundary>   // uses the built-in fallback
import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // A render crash must never fail silently — surface it for debugging.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] caught render error:', error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    // Auto-recover when the caller signals a context change (e.g. route change):
    // clears the error without remounting the subtree, so a crash on one page
    // doesn't wedge the whole app until a manual reload.
    if (this.state.hasError && this.props.resetKey !== prevProps.resetKey) {
      this.setState({ hasError: false });
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback !== undefined) return this.props.fallback;
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '14px',
            padding: '40px 20px',
            minHeight: '40vh',
            textAlign: 'center',
            color: '#a0a0a0',
          }}
        >
          <span style={{ fontSize: '2rem' }}>⚠️</span>
          <p style={{ margin: 0, fontSize: '0.95rem' }}>
            Algo deu errado ao carregar esta seção.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              padding: '10px 20px',
              borderRadius: '10px',
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'linear-gradient(135deg, #bb86fc 0%, #9a67ea 100%)',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Recarregar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
