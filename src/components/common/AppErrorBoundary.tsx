import { Component, type ErrorInfo, type ReactNode } from 'react'

type AppErrorBoundaryProps = {
  children: ReactNode
}

type AppErrorBoundaryState = {
  hasError: boolean
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('The application encountered a rendering error.', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return <main role="alert" className="grid min-h-svh place-items-center bg-[#f5f7f5] px-5 py-12 text-center text-[#243a33]">
        <div className="max-w-md">
          <img src="/quickResell.svg" alt="" className="mx-auto size-14 object-contain" />
          <h1 className="mt-5 font-display text-2xl font-bold">Something went wrong</h1>
          <p className="mt-2 text-sm leading-6 text-[#718078]">The page hit an unexpected error. Reload Quick Resell to try again.</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-5 rounded-xl bg-[#243a33] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#34564a]">Reload page</button>
        </div>
      </main>
    }

    return this.props.children
  }
}
