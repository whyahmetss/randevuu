import { Component } from 'react';

/**
 * GLOBAL ERROR BOUNDARY
 * Bir React component ağacında yakalanmayan hata olursa tüm panel
 * beyaz ekrana düşmesin diye bu bileşen yakalar ve düzgün bir fallback gösterir.
 *
 * Kullanım: <ErrorBoundary><App /></ErrorBoundary>
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Unhandled error:', error);
    console.error('[ErrorBoundary] Stack:', errorInfo?.componentStack);
    this.setState({ errorInfo });
  }

  reset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  reload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const msg = this.state.error?.message || String(this.state.error || 'Bilinmeyen hata');
    const stack = this.state.errorInfo?.componentStack || this.state.error?.stack || '';

    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, fontFamily: 'system-ui, -apple-system, sans-serif',
        background: 'linear-gradient(135deg, #fef2f2 0%, #fff 100%)'
      }}>
        <div style={{
          maxWidth: 560, width: '100%', background: '#fff', borderRadius: 16,
          padding: '32px 36px', boxShadow: '0 10px 40px rgba(239,68,68,.15)',
          border: '1px solid #fecaca'
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 8px', color: '#111' }}>
            Bir şeyler ters gitti
          </h1>
          <p style={{ fontSize: 14, color: '#666', margin: '0 0 20px', lineHeight: 1.6 }}>
            Sayfayı yüklerken beklenmedik bir hata oluştu. Aşağıdaki butonlarla tekrar deneyebilirsin.
            Problem devam ederse hata mesajını not al.
          </p>

          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
            padding: '12px 14px', marginBottom: 20, fontSize: 13, color: '#b91c1c',
            fontFamily: 'ui-monospace, SFMono-Regular, monospace', wordBreak: 'break-word'
          }}>
            {msg}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={this.reload} style={{
              flex: 1, minWidth: 140, padding: '12px 18px', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: '#fff',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(239,68,68,.25)'
            }}>🔄 Sayfayı Yenile</button>
            <button onClick={this.reset} style={{
              flex: 1, minWidth: 140, padding: '12px 18px', borderRadius: 10,
              border: '1px solid #e5e7eb', background: '#fff', color: '#374151',
              fontSize: 14, fontWeight: 600, cursor: 'pointer'
            }}>↩︎ Tekrar Dene</button>
          </div>

          {stack && (
            <details style={{ marginTop: 16 }}>
              <summary style={{
                cursor: 'pointer', fontSize: 12, color: '#6b7280',
                fontWeight: 600, userSelect: 'none'
              }}>Teknik detaylar</summary>
              <pre style={{
                marginTop: 8, padding: 12, background: '#f9fafb', borderRadius: 8,
                fontSize: 11, color: '#374151', overflow: 'auto', maxHeight: 200,
                fontFamily: 'ui-monospace, SFMono-Regular, monospace'
              }}>{stack}</pre>
            </details>
          )}
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
