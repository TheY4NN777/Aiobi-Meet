import { BackendLanguage } from '@/utils/languages'

export type AccountTier = 'normal' | 'enterprise'

export type ApiUser = {
  id: string
  email: string
  full_name: string
  short_name: string
  language: BackendLanguage
  timezone: string
  account_tier: AccountTier
}
