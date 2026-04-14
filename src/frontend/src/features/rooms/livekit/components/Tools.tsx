import { A, Div, Icon, Text } from '@/primitives'
import { css } from '@/styled-system/css'
import { Button as RACButton } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { ReactNode } from 'react'
import { SubPanelId, useSidePanel } from '../hooks/useSidePanel'
import { useRestoreFocus } from '@/hooks/useRestoreFocus'
import {
  useIsRecordingModeEnabled,
  RecordingMode,
  TranscriptSidePanel,
  ScreenRecordingSidePanel,
} from '@/features/recording'
import { useConfig } from '@/api/useConfig'
import { useIsEnterprise } from '@/features/auth/hooks/useIsEnterprise'
import { useUsage } from '@/features/auth/hooks/useUsage'

export interface ToolsButtonProps {
  icon: ReactNode
  title: string
  description: string
  onPress: () => void
}

const ToolButton = ({
  icon,
  title,
  description,
  onPress,
}: ToolsButtonProps) => {
  return (
    <RACButton
      className={css({
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'start',
        paddingY: '0.5rem',
        paddingX: '0.75rem 1.5rem',
        borderRadius: '30px',
        width: 'full',
        backgroundColor: 'gray.50',
        textAlign: 'start',
        '&[data-hovered]': {
          backgroundColor: 'primary.50',
          cursor: 'pointer',
        },
      })}
      onPress={onPress}
    >
      <div
        className={css({
          height: '40px',
          minWidth: '40px',
          borderRadius: '25px',
          marginRight: '0.75rem',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          position: 'relative',
          background: 'primary.800',
          color: 'white',
        })}
      >
        {icon}
      </div>
      <div>
        <Text
          margin={false}
          as="h2"
          className={css({
            display: 'flex',
            gap: 0.25,
            fontWeight: 'semibold',
          })}
        >
          {title}
        </Text>
        <Text as="p" variant="smNote" wrap="pretty">
          {description}
        </Text>
      </div>
      <div
        className={css({
          marginLeft: 'auto',
          height: '100%',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        })}
      >
        <Icon type="symbols" name="chevron_forward" />
      </div>
    </RACButton>
  )
}

export const Tools = () => {
  const { data } = useConfig()
  const { openTranscript, openScreenRecording, activeSubPanelId, isToolsOpen } =
    useSidePanel()
  const { t } = useTranslation('rooms', { keyPrefix: 'moreTools' })

  // Restore focus to the element that opened the Tools panel
  // following the same pattern as Chat.
  useRestoreFocus(isToolsOpen, {
    // If the active element is a MenuItem (DIV) that will be unmounted when the menu closes,
    // find the "more options" button ("Plus d'options") that opened the menu
    resolveTrigger: (activeEl) => {
      if (activeEl?.tagName === 'DIV') {
        return document.querySelector<HTMLElement>('#room-options-trigger')
      }
      // For direct button clicks (e.g. "Plus d'outils"), use the active element as is
      return activeEl
    },
    restoreFocusRaf: true,
    preventScroll: true,
  })

  const isTranscriptEnabled = useIsRecordingModeEnabled(
    RecordingMode.Transcript
  )

  const isScreenRecordingEnabled = useIsRecordingModeEnabled(
    RecordingMode.ScreenRecording
  )

  const isEnterprise = useIsEnterprise()
  const { recordingLimitReached, transcriptionLimitReached } = useUsage()

  switch (activeSubPanelId) {
    case SubPanelId.TRANSCRIPT:
      return <TranscriptSidePanel />
    case SubPanelId.SCREEN_RECORDING:
      return <ScreenRecordingSidePanel />
    default:
      break
  }

  return (
    <Div
      display="flex"
      overflowY="scroll"
      padding="0 0.75rem"
      flexGrow={1}
      flexDirection="column"
      alignItems="start"
      gap={0.5}
    >
      {isEnterprise && (
        <div className={css({ width: 'full', borderRadius: '10px', background: 'linear-gradient(135deg, #4A3C5C, #6b4f8a)', padding: '0.6rem 0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' })}>
          <span style={{ background: '#E4D3E6', color: '#4A3C5C', fontSize: '0.6rem', fontWeight: 700, padding: '2px 7px', borderRadius: '20px', letterSpacing: '0.06em', flexShrink: 0 }}>
            ENTREPRISE
          </span>
          <span style={{ color: '#E4D3E6', fontSize: '0.78rem', fontWeight: 500 }}>
            Enregistrements &amp; transcriptions illimités
          </span>
        </div>
      )}
      <Text
        variant="note"
        wrap="balance"
        className={css({
          textStyle: 'sm',
          paddingX: '0.75rem',
          paddingTop: '0.25rem',
          marginBottom: '1rem',
        })}
      >
        {t('body')}{' '}
        {data?.support?.help_article_more_tools && (
          <A
            href={data.support.help_article_more_tools}
            target="_blank"
            rel="noopener noreferrer"
            externalIcon
            color="note"
            aria-label={t('linkAriaLabel')}
          >
            {t('moreLink')}
          </A>
        )}
      </Text>
      {isTranscriptEnabled && (
        transcriptionLimitReached ? (
          <div className={css({ width: 'full', borderRadius: '12px', overflow: 'hidden', background: 'linear-gradient(145deg, #2d1f3d 0%, #4A3C5C 100%)', color: 'white' })}>
            <div className={css({ padding: '1.25rem 1rem 1rem' })}>
              <Text margin={false} as="h2" className={css({ fontWeight: 'bold', fontSize: 'sm', color: 'white', marginBottom: '0.5rem' })}>
                Transcription indisponible
              </Text>
              <Text as="p" variant="smNote" className={css({ color: '#d4bfe8', marginBottom: '0.75rem' })}>
                Vous avez atteint la limite de votre plan ce mois-ci.
              </Text>
              <a href="https://meet.aiobi.world/#pricing" target="_blank" rel="noopener noreferrer" className={css({ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.65rem', borderRadius: '8px', background: '#4A3C5C', color: 'white', fontWeight: 'bold', fontSize: 'sm', textDecoration: 'none', '&:hover': { background: '#5d4d6f' }, transition: 'background 0.2s', marginBottom: '0.5rem' })}>
                Passer à Entreprise
              </a>
              <a href="https://meet.aiobi.world/#pricing" target="_blank" rel="noopener noreferrer" className={css({ display: 'block', textAlign: 'center', color: '#d4bfe8', fontSize: '0.75rem', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } })}>
                En savoir plus sur les offres
              </a>
            </div>
          </div>
        ) : (
          <ToolButton
            icon={<Icon type="symbols" name="speech_to_text" />}
            title={t('tools.transcript.title')}
            description={t('tools.transcript.body')}
            onPress={() => openTranscript()}
          />
        )
      )}
      {isScreenRecordingEnabled && (
        recordingLimitReached ? (
          <div className={css({ width: 'full', borderRadius: '12px', overflow: 'hidden', background: 'linear-gradient(145deg, #2d1f3d 0%, #4A3C5C 100%)', color: 'white' })}>
            <div className={css({ padding: '1.25rem 1rem 1rem' })}>
              <Text margin={false} as="h2" className={css({ fontWeight: 'bold', fontSize: 'sm', color: 'white', marginBottom: '0.5rem' })}>
                Enregistrement indisponible
              </Text>
              <Text as="p" variant="smNote" className={css({ color: '#d4bfe8', marginBottom: '0.75rem' })}>
                Vous avez atteint la limite de votre plan ce mois-ci.
              </Text>
              <a href="https://meet.aiobi.world/#pricing" target="_blank" rel="noopener noreferrer" className={css({ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.65rem', borderRadius: '8px', background: '#4A3C5C', color: 'white', fontWeight: 'bold', fontSize: 'sm', textDecoration: 'none', '&:hover': { background: '#5d4d6f' }, transition: 'background 0.2s', marginBottom: '0.5rem' })}>
                Passer à Entreprise
              </a>
              <a href="https://meet.aiobi.world/#pricing" target="_blank" rel="noopener noreferrer" className={css({ display: 'block', textAlign: 'center', color: '#d4bfe8', fontSize: '0.75rem', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } })}>
                En savoir plus sur les offres
              </a>
            </div>
          </div>
        ) : (
          <ToolButton
            icon={<Icon type="symbols" name="mode_standby" />}
            title={t('tools.screenRecording.title')}
            description={t('tools.screenRecording.body')}
            onPress={() => openScreenRecording()}
          />
        )
      )}
    </Div>
  )
}
