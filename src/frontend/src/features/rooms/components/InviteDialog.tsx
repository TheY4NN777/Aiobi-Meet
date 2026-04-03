import { useTranslation } from 'react-i18next'
import { getRouteUrl } from '@/navigation/getRouteUrl'
import { Div, Button, type DialogProps, P, Bold } from '@/primitives'
import { HStack, styled, VStack } from '@/styled-system/jsx'
import { Heading, Dialog } from 'react-aria-components'
import { Text, text } from '@/primitives/Text'
import {
  RiCheckLine,
  RiCloseLine,
  RiFileCopyLine,
  RiMailSendLine,
  RiSpam2Fill,
} from '@remixicon/react'
import { useCallback, useMemo, useState } from 'react'
import { css } from '@/styled-system/css'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'
import { ApiAccessLevel } from '@/features/rooms/api/ApiRoom'
import { useTelephony } from '@/features/rooms/livekit/hooks/useTelephony'
import { formatPinCode } from '@/features/rooms/utils/telephony'
import { useCopyRoomToClipboard } from '@/features/rooms/livekit/hooks/useCopyRoomToClipboard'
import { useInviteToRoom } from '@/features/rooms/api/inviteToRoom'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// fixme - extract in a proper primitive this dialog without overlay
const StyledRACDialog = styled(Dialog, {
  base: {
    position: 'fixed',
    left: '0.75rem',
    bottom: 80,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    width: '24.5rem',
    borderRadius: '8px',
    padding: '1.5rem',
    boxShadow:
      '0 1px 2px 0 rgba(60, 64, 67, .3), 0 2px 6px 2px rgba(60, 64, 67, .15)',
    backgroundColor: 'white',
    '&[data-entering]': { animation: 'fade 200ms' },
    '&[data-exiting]': { animation: 'fade 150ms reverse ease-in' },
  },
})

export const InviteDialog = (props: Omit<DialogProps, 'title'>) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'shareDialog' })

  const roomData = useRoomData()
  const roomUrl = getRouteUrl('room', roomData?.slug)

  const telephony = useTelephony()

  const isTelephonyReadyForUse = useMemo(() => {
    return telephony?.enabled && roomData?.pin_code
  }, [telephony?.enabled, roomData?.pin_code])

  const {
    isCopied,
    copyRoomToClipboard,
    isRoomUrlCopied,
    copyRoomUrlToClipboard,
  } = useCopyRoomToClipboard(roomData)

  // Email invite state
  const [emails, setEmails] = useState<string[]>([])
  const [emailInput, setEmailInput] = useState('')
  const [emailError, setEmailError] = useState('')
  const [scheduledDate, setScheduledDate] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')
  const [inviteSent, setInviteSent] = useState(false)

  const inviteMutation = useInviteToRoom({
    onSuccess: () => {
      setInviteSent(true)
      setEmails([])
      setEmailInput('')
      setScheduledDate('')
      setScheduledTime('')
      setTimeout(() => setInviteSent(false), 3000)
    },
  })

  const addEmail = useCallback(
    (value: string) => {
      const trimmed = value.trim().toLowerCase()
      if (!trimmed) return
      if (!EMAIL_REGEX.test(trimmed)) {
        setEmailError(t('invalidEmail'))
        return
      }
      if (emails.includes(trimmed)) {
        setEmailInput('')
        return
      }
      setEmails((prev) => [...prev, trimmed])
      setEmailInput('')
      setEmailError('')
    },
    [emails, t]
  )

  const removeEmail = useCallback((email: string) => {
    setEmails((prev) => prev.filter((e) => e !== email))
  }, [])

  const handleEmailKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault()
        addEmail(emailInput)
      }
      if (e.key === 'Backspace' && !emailInput && emails.length > 0) {
        setEmails((prev) => prev.slice(0, -1))
      }
    },
    [addEmail, emailInput, emails.length]
  )

  const handleSendInvites = useCallback(() => {
    if (!roomData?.id || emails.length === 0) return
    inviteMutation.mutate({
      roomId: roomData.id,
      emails,
      scheduledDate: scheduledDate || null,
      scheduledTime: scheduledTime || null,
    })
  }, [roomData?.id, emails, scheduledDate, scheduledTime, inviteMutation])

  const canInvite = roomData?.is_administrable

  return (
    <StyledRACDialog {...props}>
      {({ close }) => (
        <VStack
          alignItems="left"
          justify="start"
          gap={0}
          style={{ maxWidth: '100%', overflow: 'visible' }}
        >
          <Heading slot="title" level={2} className={text({ variant: 'h2' })}>
            {t('heading')}
          </Heading>
          <Div position="absolute" top="5" right="5">
            <Button
              invisible
              variant="tertiaryText"
              size="xs"
              onPress={() => {
                props.onClose?.()
                close()
              }}
              aria-label={t('closeDialog')}
            >
              <RiCloseLine />
            </Button>
          </Div>
          <P>{t('description')}</P>
          {isTelephonyReadyForUse ? (
            <div
              className={css({
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                marginTop: '0.5rem',
                gap: '1rem',
                overflow: 'visible',
              })}
            >
              <div
                className={css({
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                })}
              >
                <Text as="p" wrap="pretty">
                  {roomUrl?.replace(/^https?:\/\//, '')}
                </Text>
                {isTelephonyReadyForUse && roomUrl && (
                  <Button
                    variant={isRoomUrlCopied ? 'success' : 'tertiaryText'}
                    square
                    size={'sm'}
                    onPress={copyRoomUrlToClipboard}
                    aria-label={isRoomUrlCopied ? t('copied') : t('copyUrl')}
                    tooltip={isRoomUrlCopied ? t('copied') : t('copyUrl')}
                  >
                    {isRoomUrlCopied ? (
                      <RiCheckLine aria-hidden="true" />
                    ) : (
                      <RiFileCopyLine aria-hidden="true" />
                    )}
                  </Button>
                )}
              </div>
              <div
                className={css({
                  display: 'flex',
                  flexDirection: 'column',
                })}
              >
                <Text as="p" wrap="pretty">
                  <Bold>{t('phone.call')}</Bold> ({telephony?.country}){' '}
                  {telephony?.internationalPhoneNumber}
                </Text>
                <Text as="p" wrap="pretty">
                  <Bold>{t('phone.pinCode')}</Bold>{' '}
                  {formatPinCode(roomData?.pin_code)}
                </Text>
              </div>

              <Button
                variant={isCopied ? 'success' : 'secondaryText'}
                size="sm"
                fullWidth
                aria-label={isCopied ? t('copied') : t('copy')}
                style={{
                  justifyContent: 'start',
                }}
                onPress={copyRoomToClipboard}
                data-attr="share-dialog-copy"
              >
                {isCopied ? (
                  <>
                    <RiCheckLine
                      size={18}
                      style={{ marginRight: '8px' }}
                      aria-hidden="true"
                    />
                    {t('copied')}
                  </>
                ) : (
                  <>
                    <RiFileCopyLine
                      style={{ marginRight: '6px', minWidth: '18px' }}
                      aria-hidden="true"
                    />
                    {t('copy')}
                  </>
                )}
              </Button>
            </div>
          ) : (
            <Button
              variant={isCopied ? 'success' : 'tertiary'}
              fullWidth
              aria-label={isCopied ? t('copied') : t('copy')}
              onPress={copyRoomToClipboard}
              data-attr="share-dialog-copy"
            >
              {isCopied ? (
                <>
                  <RiCheckLine size={24} style={{ marginRight: '8px' }} />
                  {t('copied')}
                </>
              ) : (
                <>
                  <RiFileCopyLine size={24} style={{ marginRight: '8px' }} />
                  {t('copyUrl')}
                </>
              )}
            </Button>
          )}
          {roomData?.access_level === ApiAccessLevel.PUBLIC && (
            <HStack>
              <div
                className={css({
                  backgroundColor: 'primary.200',
                  borderRadius: '50%',
                  padding: '4px',
                  marginTop: '1rem',
                })}
              >
                <RiSpam2Fill
                  size={22}
                  className={css({
                    fill: 'primary.500',
                  })}
                />
              </div>
              <Text variant="sm" style={{ marginTop: '1rem' }}>
                {t('permissions')}
              </Text>
            </HStack>
          )}

          {/* Email invite section */}
          {canInvite && (
            <>
              <div
                className={css({
                  width: '100%',
                  height: '1px',
                  backgroundColor: '#EEEEEE',
                  margin: '1rem 0',
                })}
              />
              <Text
                variant="sm"
                style={{
                  textAlign: 'center',
                  color: '#5F6368',
                  marginBottom: '0.75rem',
                }}
              >
                {t('inviteByEmail')}
              </Text>

              {/* Email chips + input */}
              {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
              <div
                className={css({
                  width: '100%',
                  border: '1.5px solid #DADCE0',
                  borderRadius: '10px',
                  padding: '0.5rem',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.25rem',
                  alignItems: 'center',
                  minHeight: '2.5rem',
                  cursor: 'text',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    borderColor: 'rgba(162, 81, 252, 0.3)',
                  },
                  '&:focus-within': {
                    borderColor: 'primary.500',
                    boxShadow: '0 0 0 3px rgba(162, 81, 252, 0.08)',
                  },
                })}
                onClick={(e) => {
                  const input = (e.currentTarget as HTMLElement).querySelector(
                    'input'
                  )
                  input?.focus()
                }}
              >
                {emails.map((email) => (
                  <span
                    key={email}
                    className={css({
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      backgroundColor: 'primary.100',
                      color: 'primary.800',
                      borderRadius: '1rem',
                      padding: '0.125rem 0.5rem',
                      fontSize: '0.75rem',
                      lineHeight: '1.5',
                    })}
                  >
                    {email}
                    <button
                      type="button"
                      onClick={() => removeEmail(email)}
                      className={css({
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '0',
                        fontSize: '0.875rem',
                        lineHeight: '1',
                        color: 'primary.600',
                        '&:hover': { color: 'primary.900' },
                      })}
                      aria-label={`Remove ${email}`}
                    >
                      &times;
                    </button>
                  </span>
                ))}
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => {
                    setEmailInput(e.target.value)
                    setEmailError('')
                  }}
                  onKeyDown={handleEmailKeyDown}
                  onBlur={() => {
                    if (emailInput.trim()) addEmail(emailInput)
                  }}
                  placeholder={
                    emails.length === 0 ? t('emailPlaceholder') : ''
                  }
                  className={css({
                    border: 'none',
                    outline: 'none',
                    flex: '1',
                    minWidth: '8rem',
                    fontSize: '0.875rem',
                    padding: '0.125rem 0',
                    backgroundColor: 'transparent',
                  })}
                />
              </div>
              {emailError && (
                <Text
                  variant="sm"
                  style={{ color: '#D93025', marginTop: '0.25rem' }}
                >
                  {emailError}
                </Text>
              )}

              {/* Date / Time row */}
              <div
                className={css({
                  display: 'flex',
                  gap: '0.5rem',
                  marginTop: '0.75rem',
                  width: '100%',
                })}
              >
                <div className={css({ flex: '1' })}>
                  <label
                    className={css({
                      fontSize: '0.75rem',
                      color: '#5F6368',
                      display: 'block',
                      marginBottom: '0.25rem',
                    })}
                  >
                    {t('scheduledDate')}{' '}
                    <span style={{ fontStyle: 'italic' }}>
                      ({t('optional')})
                    </span>
                  </label>
                  <input
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className={css({
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      border: '1.5px solid #DADCE0',
                      borderRadius: '10px',
                      fontSize: '0.875rem',
                      color: '#1a1a2e',
                      outline: 'none',
                      transition: 'all 0.2s ease',
                      WebkitAppearance: 'none',
                      '&:hover': {
                        borderColor: 'rgba(162, 81, 252, 0.3)',
                      },
                      '&:focus': {
                        borderColor: 'primary.500',
                        boxShadow: '0 0 0 3px rgba(162, 81, 252, 0.08)',
                      },
                    })}
                  />
                </div>
                <div className={css({ flex: '0.6' })}>
                  <label
                    className={css({
                      fontSize: '0.75rem',
                      color: '#5F6368',
                      display: 'block',
                      marginBottom: '0.25rem',
                    })}
                  >
                    {t('scheduledTime')}
                  </label>
                  <input
                    type="time"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className={css({
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      border: '1.5px solid #DADCE0',
                      borderRadius: '10px',
                      fontSize: '0.875rem',
                      color: '#1a1a2e',
                      outline: 'none',
                      transition: 'all 0.2s ease',
                      WebkitAppearance: 'none',
                      '&:hover': {
                        borderColor: 'rgba(162, 81, 252, 0.3)',
                      },
                      '&:focus': {
                        borderColor: 'primary.500',
                        boxShadow: '0 0 0 3px rgba(162, 81, 252, 0.08)',
                      },
                    })}
                  />
                </div>
              </div>

              {/* Send button */}
              <Button
                variant={inviteSent ? 'success' : 'primary'}
                fullWidth
                isDisabled={
                  emails.length === 0 || inviteMutation.isPending
                }
                onPress={handleSendInvites}
                style={{ marginTop: '0.75rem' }}
                data-attr="share-dialog-invite"
              >
                {inviteSent ? (
                  <>
                    <RiCheckLine
                      size={18}
                      style={{ marginRight: '8px' }}
                      aria-hidden="true"
                    />
                    {t('invitesSent')}
                  </>
                ) : (
                  <>
                    <RiMailSendLine
                      size={18}
                      style={{ marginRight: '8px' }}
                      aria-hidden="true"
                    />
                    {inviteMutation.isPending
                      ? '...'
                      : t('sendInvites')}
                  </>
                )}
              </Button>

              {inviteMutation.isError && (
                <Text
                  variant="sm"
                  style={{ color: '#D93025', marginTop: '0.25rem' }}
                >
                  {t('inviteError')}
                </Text>
              )}
            </>
          )}
        </VStack>
      )}
    </StyledRACDialog>
  )
}
