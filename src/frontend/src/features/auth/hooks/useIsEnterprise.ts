import { useUser } from '@/features/auth'

export const useIsEnterprise = (): boolean => {
  const { user } = useUser()
  return user?.account_tier === 'enterprise'
}
