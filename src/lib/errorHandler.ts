const apiErrorEvent = 'quickresell:api-error'

export type ApiErrorDetail = {
  message: string
  source: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function reportApiFailure(error: unknown, source: string): void {
  if (error instanceof DOMException && error.name === 'AbortError') return

  const status = isRecord(error) && typeof error.status === 'number' ? error.status : undefined
  const message = error instanceof Error ? error.message : ''
  const isServerFailure = status !== undefined && status >= 500
  const isNetworkFailure = status === 0
    || error instanceof TypeError
    || /network|fetch failed|could not connect|request failed for|request failed \(5\d\d\)/i.test(message)

  if (!isServerFailure && !isNetworkFailure) return

  const detail: ApiErrorDetail = {
    message: message || `The ${source} service could not be reached. Please try again.`,
    source,
  }
  window.dispatchEvent(new CustomEvent<ApiErrorDetail>(apiErrorEvent, { detail }))
}

export function addApiErrorListener(listener: (detail: ApiErrorDetail) => void): () => void {
  const handleEvent = (event: Event) => {
    if (event instanceof CustomEvent) listener(event.detail as ApiErrorDetail)
  }

  window.addEventListener(apiErrorEvent, handleEvent)
  return () => window.removeEventListener(apiErrorEvent, handleEvent)
}
