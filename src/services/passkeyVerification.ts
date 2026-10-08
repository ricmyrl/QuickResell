import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import type { Session } from '@supabase/supabase-js'
import { resolveSession } from '../lib/resolveSession'

const pageHostApiUrl = typeof window !== 'undefined' && window.location.protocol === 'http:'
  ? `http://${window.location.hostname}:3000/api`
  : ''
const configuredApiUrl = import.meta.env.VITE_API_URL?.trim()
if (import.meta.env.PROD && !configuredApiUrl) throw new Error('VITE_API_URL must be configured for production.')
if (import.meta.env.PROD && configuredApiUrl && new URL(configuredApiUrl).protocol !== 'https:') {
  throw new Error('VITE_API_URL must use HTTPS in production.')
}
const apiBaseCandidates = Array.from(new Set([
  configuredApiUrl?.replace(/\/$/, '') ?? 'http://localhost:3000/api',
  ...(import.meta.env.PROD ? [] : [pageHostApiUrl, 'http://localhost:3000/api', 'http://127.0.0.1:3000/api']),
])).filter(Boolean)

type ApiError = { error?: unknown }

class PasskeyRequestError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
    this.name = 'PasskeyRequestError'
  }
}

async function request<T>(
  path: string,
  session: Session,
  body: unknown = {},
  method: 'GET' | 'POST' = 'POST',
): Promise<T> {
  const activeSession = await resolveSession(session)
  if (!activeSession?.access_token) throw new Error('Sign in again before verifying this action.')
  let lastError: unknown

  for (const baseUrl of apiBaseCandidates) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${activeSession.access_token}`,
          'Content-Type': 'application/json',
        },
        ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
      })
      const payload = await response.json().catch(() => ({})) as ApiError
      if (!response.ok) {
        const error = new PasskeyRequestError(
          typeof payload.error === 'string' ? payload.error : `Passkey request failed (${response.status}).`,
          response.status,
        )
        if (response.status >= 500) {
          lastError = error
          continue
        }
        throw error
      }
      return payload as T
    } catch (error) {
      if (error instanceof PasskeyRequestError) throw error
      lastError = error
    }
  }

  if (lastError instanceof Error) throw lastError
  throw new Error('Passkey verification could not reach the server.')
}

function assertPlatformAuthenticatorAvailable(): Promise<void> {
  if (typeof window === 'undefined' || !window.isSecureContext || !window.PublicKeyCredential) {
    throw new Error('Passkey verification requires a supported browser on HTTPS or localhost.')
  }
  return window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then((available) => {
    if (!available) throw new Error('This device does not have a supported fingerprint, face, or device-PIN authenticator.')
  })
}

async function enrollPasskey(session: Session): Promise<void> {
  const { options } = await request<{ options: Parameters<typeof startRegistration>[0]['optionsJSON'] }>(
    '/passkeys/registration/options',
    session,
  )
  const response = await startRegistration({ optionsJSON: options })
  await request<{ verified: true }>('/passkeys/registration/verify', session, { response })
}

async function authenticatePasskey(session: Session): Promise<void> {
  const { options } = await request<{ options: Parameters<typeof startAuthentication>[0]['optionsJSON'] }>(
    '/passkeys/authentication/options',
    session,
  )
  const response = await startAuthentication({ optionsJSON: options })
  await request<{ verified: true }>('/passkeys/authentication/verify', session, { response })
}

export async function verifyPasskeyForAction<T>(session: Session, action: () => Promise<T>): Promise<T> {
  await assertPlatformAuthenticatorAvailable()
  const { hasPasskey } = await request<{ hasPasskey: boolean }>('/passkeys/status', session, undefined, 'GET')
  try {
    if (hasPasskey) await authenticatePasskey(session)
    else {
      const accepted = window.confirm(
        'Confirm important actions with your device fingerprint, face, or PIN. QuickResell stores only a public passkey credential, never biometric data. Passkeys do not prevent multiple accounts. Set up a passkey now?',
      )
      if (!accepted) throw new Error('Passkey setup was cancelled.')
      await enrollPasskey(session)
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      throw new Error('Passkey verification was cancelled or timed out.')
    }
    throw error
  }
  return action()
}
