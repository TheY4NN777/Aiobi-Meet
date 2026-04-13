import { useParams } from 'wouter'
import { useQuery } from '@tanstack/react-query'
import { Center, VStack } from '@/styled-system/jsx'
import { css } from '@/styled-system/css'
import { useTranslation } from 'react-i18next'
import { mediaUrl } from '@/api/mediaUrl'
import { UserAware, useUser } from '@/features/auth'
import { Screen } from '@/layout/Screen'
import { H, LinkButton, Text } from '@/primitives'
import { formatDate } from '@/utils/formatDate'
import { ErrorScreen } from '@/components/ErrorScreen'
import { LoadingScreen } from '@/components/LoadingScreen'
import { fetchRecording } from '../api/fetchRecording'
import { RecordingStatus } from '@/features/recording'
import { useConfig } from '@/api/useConfig'
import { navigateTo } from '@/navigation/navigateTo'

const BetaBadge = () => (
  <span
    className={css({
      content: '"Beta"',
      display: 'block',
      letterSpacing: '-0.02rem',
      padding: '0 0.25rem',
      backgroundColor: 'primary.100',
      color: '#0063CB',
      fontSize: '14px',
      fontWeight: 500,
      margin: '0 0.3125rem',
      lineHeight: '1rem',
      borderRadius: '4px',
      width: 'fit-content',
      height: 'fit-content',
    })}
  >
    Beta
  </span>
)

export const RecordingDownload = () => {
  const { t } = useTranslation('recording')
  const { data: configData } = useConfig()
  const { recordingId } = useParams()
  const { isLoggedIn, isLoading: isAuthLoading } = useUser()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['recording', recordingId],
    queryFn: () => fetchRecording({ recordingId }),
    retry: false,
    enabled: !!recordingId,
  })

  if (isLoggedIn === undefined || isAuthLoading) {
    return <LoadingScreen />
  }

  if (isLoggedIn === false && !isAuthLoading) {
    return (
      <ErrorScreen
        title={t('authentication.title')}
        body={t('authentication.body')}
      />
    )
  }

  if (isLoading) {
    return <LoadingScreen />
  }

  if (isError || !data) {
    return <ErrorScreen title={t('error.title')} body={t('error.body')} />
  }

  if (
    data.status !== RecordingStatus.Saved &&
    data.status !== RecordingStatus.NotificationSucceed &&
    data.status !== RecordingStatus.FailedToStop
  ) {
    return <ErrorScreen title={t('unsaved.title')} body={t('unsaved.body')} />
  }

  if (data.is_expired) {
    return (
      <ErrorScreen
        title={t('expired.title')}
        body={t('expired.body', {
          date: formatDate(data?.expired_at, 'YYYY-MM-DD HH:mm'),
        })}
      />
    )
  }

  return (
    <UserAware>
      <Screen layout="centered" footer={false}>
        <div className={css({ display: 'flex', justifyContent: 'flex-end', padding: '0.5rem 1rem 0 0' })}>
          <button
            onClick={() => navigateTo('home')}
            className={css({
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.8rem',
              color: 'greyscale.500',
              _hover: { color: '#a251fc' },
            })}
          >
            Tableau de bord
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18"/></svg>
          </button>
        </div>
        <Center>
          <VStack>
            <img
              src="/assets/intro-slider/4.png"
              alt={''}
              className={css({
                maxHeight: '309px',
              })}
            />
            <H lvl={1} centered>
              {t('success.title')}
            </H>
            <Text centered margin="md" wrap={'balance'}>
              <span>
                {t('success.body', {
                  room: data.room.name,
                  created_at: formatDate(data.created_at, 'YYYY-MM-DD HH:mm'),
                })}
              </span>
              <span>
                {configData?.recording?.expiration_days && (
                  <>
                    {' '}
                    {t('success.expiration', {
                      expiration_days: configData?.recording?.expiration_days,
                    })}
                  </>
                )}
              </span>
            </Text>
            {data.mode === 'screen_recording' && (
              <LinkButton
                href={mediaUrl(data.key)}
                download={`${data.room.name}-${formatDate(data.created_at)}`}
              >
                {t('success.button')}
              </LinkButton>
            )}
            {data.has_transcription && data.transcription_key && (
              <LinkButton
                href={mediaUrl(data.transcription_key)}
                download={`${data.room.name}-${formatDate(data.created_at)}-transcription.md`}
              >
                {t('success.transcription_button')}
              </LinkButton>
            )}
            {data.mode === 'transcript' && (
              <a
                href={mediaUrl(data.key)}
                download={`${data.room.name}-${formatDate(data.created_at)}-audio`}
                className={css({
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0.5rem 1.25rem',
                  fontSize: '0.85rem',
                  color: 'greyscale.600',
                  background: 'greyscale.100',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  fontWeight: 500,
                  _hover: { background: 'greyscale.200' },
                  transition: 'background 0.2s',
                })}
              >
                Télécharger la piste audio
              </a>
            )}
            <div
              className={css({
                backgroundColor: 'greyscale.50',
                borderRadius: '5px',
                paddingY: '1rem',
                paddingX: '1rem',
                maxWidth: '80%',
                marginTop: '1rem',
                display: 'flex',
                flexDirection: 'column',
              })}
            >
              <Text
                className={css({
                  display: 'flex',
                  alignItems: 'center',
                })}
              >
                {t('success.warning.title')} <BetaBadge />
              </Text>
              <Text variant="smNote">{t('success.warning.body')}</Text>
            </div>
          </VStack>
        </Center>
      </Screen>
    </UserAware>
  )
}
