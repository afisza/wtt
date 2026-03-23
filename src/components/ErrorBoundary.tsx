import React from 'react'
import { AlertTriangle, RotateCcw, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Application error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="text-center max-w-md animate-fade-in">
            <div className="rounded-full bg-destructive/10 p-6 inline-flex mb-6">
              <AlertTriangle className="h-12 w-12 text-destructive" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Coś poszło nie tak</h1>
            <p className="text-sm text-muted-foreground mb-6">
              Wystąpił nieoczekiwany błąd. Spróbuj odświeżyć stronę lub wróć na stronę główną.
            </p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={() => this.setState({ hasError: false, error: null })}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Spróbuj ponownie
              </Button>
              <Button onClick={() => { window.location.href = '/' }}>
                <Home className="h-4 w-4 mr-2" />
                Strona główna
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
