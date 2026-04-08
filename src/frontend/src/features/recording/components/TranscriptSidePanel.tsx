import { A, Button, Div, H, Text } from '@/primitives'

import { css } from '@/styled-system/css'
import { useRoomId } from '@/features/rooms/livekit/hooks/useRoomId'
import { useRoomContext } from '@livekit/components-react'
import {
  RecordingMode,
  useHasRecordingAccess,
  useHasFeatureWithoutAdminRights,
  useHumanizeRecordingMaxDuration,
  useRecordingStatuses,
} from '../index'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FeatureFlags } from '@/features/analytics/enums'
import {
  NotificationType,
  useNotifyParticipants,
  notifyRecordingSaveInProgress,
} from '@/features/notifications'
import posthog from 'posthog-js'
import { useConfig } from '@/api/useConfig'
import { VStack } from '@/styled-system/jsx'
import { Checkbox } from '@/primitives/Checkbox.tsx'

import {
  useSettingsDialog,
  SettingsDialogExtendedKey,
  useTranscriptionLanguage,
} from '@/features/settings'
import { NoAccessView } from './NoAccessView'
import { ControlsButton } from './ControlsButton'
import { RowWrapper } from './RowWrapper'
import { useMutateRecording } from '../hooks/useMutateRecording'
import { useSidePanel } from '@/features/rooms/livekit/hooks/useSidePanel'

export const TranscriptSidePanel = () => {
  const { data } = useConfig()
  const recordingMaxDuration = useHumanizeRecordingMaxDuration()

  const keyPrefix = 'transcript'
  const { t } = useTranslation('rooms', { keyPrefix })

  const [includeScreenRecording, setIncludeScreenRecording] = useState(false)

  const { notifyParticipants } = useNotifyParticipants()
  const { selectedLanguageKey, selectedLanguageLabel, isLanguageSetToAuto } =
    useTranscriptionLanguage()

  const { openSettingsDialog } = useSettingsDialog()

  const hasTranscriptAccess = useHasRecordingAccess(
    RecordingMode.Transcript,
    FeatureFlags.Transcript
  )

  const hasFeatureWithoutAdminRights = useHasFeatureWithoutAdminRights(
    RecordingMode.Transcript,
    FeatureFlags.Transcript
  )

  const roomId = useRoomId()

  const { startRecording, isPendingToStart, stopRecording, isPendingToStop } =
    useMutateRecording()

  const statuses = useRecordingStatuses(RecordingMode.Transcript)

  const room = useRoomContext()
  const { openScreenRecording } = useSidePanel()

  const handleRequestTranscription = async () => {
    await notifyParticipants({
      type: NotificationType.TranscriptionRequested,
    })
    posthog.capture('transcript-requested', {})
  }

  const handleTranscript = async () => {
    if (!roomId) {
      console.warn('No room ID found')
      return
    }
    try {
      if (statuses.isStarted || statuses.isStarting) {
        await stopRecording({ id: roomId })
        setIncludeScreenRecording(false)

        await notifyParticipants({
          type: NotificationType.TranscriptionStopped,
        })
        notifyRecordingSaveInProgress(
          RecordingMode.Transcript,
          room.localParticipant
        )
      } else {
        const recordingMode = includeScreenRecording
          ? RecordingMode.ScreenRecording
          : RecordingMode.Transcript

        const recordingOptions = {
          ...(!isLanguageSetToAuto && {
            language: selectedLanguageKey,
          }),
          ...(includeScreenRecording && {
            transcribe: true,
            original_mode: RecordingMode.Transcript,
          }),
        }

        await startRecording({
          id: roomId,
          mode: recordingMode,
          options: recordingOptions,
        })

        await notifyParticipants({
          type: NotificationType.TranscriptionStarted,
        })
        posthog.capture('transcript-started', {
          includeScreenRecording: includeScreenRecording,
          language: selectedLanguageKey,
        })
      }
    } catch (error) {
      console.error('Failed to handle transcript:', error)
    }
  }

  if (hasFeatureWithoutAdminRights) {
    return (
      <NoAccessView
        i18nKeyPrefix={keyPrefix}
        i18nKey="notAdminOrOwner"
        helpArticle={data?.support?.help_article_transcript}
        imagePath="/assets/intro-slider/3.png"
        handleRequest={handleRequestTranscription}
        isActive={statuses.isActive}
      />
    )
  }

  if (!hasTranscriptAccess) {
    return (
      <NoAccessView
        i18nKeyPrefix={keyPrefix}
        i18nKey="premium"
        helpArticle={data?.support?.help_article_transcript}
        imagePath="/assets/intro-slider/3.png"
        handleRequest={handleRequestTranscription}
        isActive={statuses.isActive}
      />
    )
  }

  return (
    <Div
      display="flex"
      overflowY="scroll"
      padding="0 1.5rem"
      flexGrow={1}
      flexDirection="column"
      alignItems="center"
    >
      <div
        className={css({
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '120px',
          height: '120px',
          borderRadius: '50%',
          background: 'linear-gradient(145deg, #4A3C5C 0%, #2d1f3d 100%)',
          marginBottom: '1.25rem',
          marginTop: '0.5rem',
          flexShrink: 0,
          '@media (max-height: 770px)': {
            display: 'none',
          },
        })}
      >
        <svg width="90" height="90" viewBox="0 0 90 90" aria-hidden="true">
          {[
            '  .M.  ',
            ' [MMM] ',
            ' [MoM] ',
            ' [MMM] ',
            '  .M.  ',
            '   |   ',
            ' (   ) ',
            " '---' ",
          ].map((row, i) => (
            <text
              key={i}
              x="27 33 39 45 51 57 63"
              y={12 + i * 11}
              fontFamily="'Space Mono','Courier New',monospace"
              fontSize="8"
              fontWeight="700"
              fill="#E4D3E6"
            >
              {row}
            </text>
          ))}
        </svg>
      </div>
      <VStack gap={0} marginBottom={15}>
        <H lvl={1} margin={'sm'}>
          {t('heading')}
        </H>
        <Text variant="body" fullWidth>
          {recordingMaxDuration
            ? t('body', { max_duration: recordingMaxDuration })
            : t('bodyWithoutMaxDuration')}{' '}
          {data?.support?.help_article_transcript && (
            <A
              href={data.support.help_article_transcript}
              target="_blank"
              rel="noopener noreferrer"
              externalIcon
              aria-label={t('linkAriaLabel')}
            >
              {t('linkMore')}
            </A>
          )}
        </Text>
      </VStack>
      <VStack gap={0} marginBottom={25}>
        <RowWrapper iconName="article" position="first">
          <Text variant="sm">
            {data?.transcription_destination ? (
              <>
                {t('details.destination')}{' '}
                <A
                  href={data.transcription_destination}
                  target="_blank"
                  rel="noopener noreferrer"
                  externalIcon
                >
                  {data.transcription_destination.replace('https://', '')}
                </A>
              </>
            ) : (
              t('details.destinationUnknown')
            )}
          </Text>
        </RowWrapper>
        <RowWrapper iconName="mail">
          <Text variant="sm">{t('details.receiver')}</Text>
        </RowWrapper>
        <RowWrapper iconName="language" position="last">
          <Text variant="sm">{t('details.language')}</Text>
          <Text variant="sm">
            <Button
              variant="text"
              size="xs"
              onPress={() =>
                openSettingsDialog(SettingsDialogExtendedKey.TRANSCRIPTION)
              }
            >
              {selectedLanguageLabel}
            </Button>
          </Text>
        </RowWrapper>
        <div className={css({ height: '15px' })} />
        <div
          className={css({
            width: '100%',
            marginLeft: '20px',
          })}
        >
          <Checkbox
            size="sm"
            isSelected={includeScreenRecording}
            onChange={setIncludeScreenRecording}
            isDisabled={statuses.isActive || isPendingToStart}
          >
            <Text variant="sm">{t('details.recording')}</Text>
          </Checkbox>
        </div>
      </VStack>
      <ControlsButton
        i18nKeyPrefix={keyPrefix}
        handle={handleTranscript}
        statuses={statuses}
        isPendingToStart={isPendingToStart}
        isPendingToStop={isPendingToStop}
        openSidePanel={openScreenRecording}
      />
    </Div>
  )
}
