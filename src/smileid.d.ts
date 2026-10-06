export {}

declare global {
  interface SmileIdentityResult {
    status: 'success' | 'failure' | 'cancelled'
    value?: { job_id?: string; user_id?: string; status?: string }
    error?: { error_code?: string; message?: string; retryable?: boolean }
  }

  interface SmileIdentityConfig {
    token: string
    product: 'biometric_kyc'
    callback_url: string
    environment: 'sandbox' | 'production'
    partner_details: {
      partner_id: string
      name: string
      logo_url: string
      policy_url: string
      theme_color: string
    }
    id_selection: { NG: string[] }
    partner_params: { internal_reference: string; user_id: string }
    onResult: (result: SmileIdentityResult) => void
  }

  interface Window {
    SmileIdentity?: (configuration: SmileIdentityConfig) => void
  }
}