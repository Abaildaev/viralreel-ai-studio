import React from 'react';
import { ArrowPathIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { Button, Card } from './ui';

/*
  A render error used to take the whole interface with it: React unmounts the
  tree it cannot render, and what the reader gets is a white page with no
  explanation and nothing to click. The app grew a long way past the point
  where that is an acceptable failure mode.
*/

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /**
   * Changing this remounts the boundary and clears the error. Pass the open
   * section so navigating away from a broken page recovers, rather than
   * leaving the reader stuck until they reload.
   */
  resetKey?: string;
  /** Shown above the error, to say which part failed. */
  title?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidUpdate(previous: ErrorBoundaryProps): void {
    if (previous.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Kept in the console rather than sent anywhere: this project has no error
    // reporting service, and inventing one here would be a bigger decision
    // than a boundary.
    console.error('Ошибка рендера', error, info.componentStack);
  }

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <Card className="mx-auto max-w-xl">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
              <ExclamationTriangleIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-gray-900">
                {this.props.title ?? 'Раздел не открылся'}
              </h2>
              <p className="mt-1.5 text-xs leading-relaxed text-gray-600">
                Что-то сломалось при отрисовке. Остальные разделы работают — можно
                перейти в другой через меню слева.
              </p>

              {/* The message is the one thing that makes a bug report useful, so
                  it is shown rather than hidden behind a console. */}
              <pre className="scroll-x mt-3 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-2xs text-gray-600">
                {error.message || String(error)}
              </pre>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  icon={<ArrowPathIcon className="h-3.5 w-3.5" />}
                  onClick={() => this.setState({ error: null })}
                >
                  Попробовать снова
                </Button>
                <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
                  Перезагрузить страницу
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>
    );
  }
}

export default ErrorBoundary;
