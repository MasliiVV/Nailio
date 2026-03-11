import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui';

interface Props {
  children: ReactNode;
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

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '60vh',
            padding: '32px',
            textAlign: 'center',
            gap: '16px',
          }}
        >
          <AlertCircle size={48} color="var(--color-warning)" />
          <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Щось пішло не так</h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '15px' }}>
            {this.state.error?.message || 'Невідома помилка'}
          </p>
          <Button onClick={this.handleRetry}>Спробувати ще</Button>
        </div>
      );
    }

    return this.props.children;
  }
}
