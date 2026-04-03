import { useTranslation } from 'react-i18next'
import { getRouteUrl } from '@/navigation/getRouteUrl'
import { Div, Button, type DialogProps, P, Bold } from '@/primitives'
import { HStack, styled, VStack } from '@/styled-system/jsx'
import {
  Heading,
  Dialog,
  DatePicker,
  DateInput,
  DateSegment,
  Calendar,
  CalendarGrid,
  CalendarCell,
  Button as RACButton,
  Group,
  Popover,
  TimeField,
  Label,
} from 'react-aria-components'
import { today, getLocalTimeZone } from '@internationalized/date'
import type { CalendarDate, Time } from '@internationalized/date'
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
  const [scheduledDate, setScheduledDate] = useState<CalendarDate | null>(null)
  const [scheduledTime, setScheduledTime] = useState<Time | null>(null)
  const [inviteSent, setInviteSent] = useState(false)

  const inviteMutation = useInviteToRoom({
    onSuccess: () => {
      setInviteSent(true)
      setEmails([])
      setEmailInput('')
      setScheduledDate(null)
      setScheduledTime(null)
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
      scheduledDate: scheduledDate?.toString() || null,
      scheduledTime: scheduledTime
        ? `${String(scheduledTime.hour).padStart(2, '0')}:${String(scheduledTime.minute).padStart(2, '0')}`
        : null,
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

              {/* Date / Time — React Aria */}
              <div
                className={css({
                  display: 'flex',
                  gap: '0.5rem',
                  marginTop: '0.75rem',
                  width: '100%',
                })}
              >
                <DatePicker
                  value={scheduledDate}
                  onChange={setScheduledDate}
                  minValue={today(getLocalTimeZone())}
                  className={css({ flex: '1' })}
                >
                  <Label
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
                  </Label>
                  <Group
                    className={css({
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      padding: '0.4rem 0.6rem',
                      border: '1.5px solid #DADCE0',
                      borderRadius: '10px',
                      background: 'white',
                      transition: 'all 0.2s ease',
                      '&:hover': {
                        borderColor: 'rgba(162, 81, 252, 0.3)',
                      },
                      '&:focus-within': {
                        borderColor: 'primary.500',
                        boxShadow: '0 0 0 3px rgba(162, 81, 252, 0.08)',
                      },
                    })}
                  >
                    <DateInput
                      className={css({
                        display: 'flex',
                        alignItems: 'center',
                        flex: '1',
                      })}
                    >
                      {(segment) => (
                        <DateSegment
                          segment={segment}
                          className={css({
                            padding: '1px 2px',
                            borderRadius: '4px',
                            fontSize: '0.8rem',
                            outline: 'none',
                            '&[data-focused]': {
                              background: 'primary.500',
                              color: 'white',
                            },
                            '&[data-placeholder]': {
                              color: '#5F6368',
                            },
                          })}
                        />
                      )}
                    </DateInput>
                    <RACButton
                      className={css({
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px',
                        borderRadius: '6px',
                        color: 'primary.500',
                        display: 'flex',
                        alignItems: 'center',
                        '&:hover': {
                          background: 'rgba(162, 81, 252, 0.08)',
                          color: 'primary.700',
                        },
                      })}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    </RACButton>
                  </Group>
                  <Popover
                    UNSTABLE_portalContainer={document.body}
                    className={css({
                      background: 'white',
                      borderRadius: '12px',
                      boxShadow: '0 16px 48px rgba(0, 0, 0, 0.18)',
                      border: '1px solid #ebebf0',
                      padding: '1rem',
                      zIndex: 9999,
                    })}
                  >
                    <Dialog>
                      <Calendar>
                        <header
                          className={css({
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '0.75rem',
                          })}
                        >
                          <RACButton
                            slot="previous"
                            className={css({
                              background: 'none',
                              border: '1.5px solid #ebebf0',
                              borderRadius: '8px',
                              width: '32px',
                              height: '32px',
                              cursor: 'pointer',
                              '&:hover': {
                                borderColor: 'primary.500',
                                color: 'primary.500',
                              },
                            })}
                          >
                            &larr;
                          </RACButton>
                          <Heading
                            className={css({
                              fontSize: '0.85rem',
                              fontWeight: '600',
                            })}
                          />
                          <RACButton
                            slot="next"
                            className={css({
                              background: 'none',
                              border: '1.5px solid #ebebf0',
                              borderRadius: '8px',
                              width: '32px',
                              height: '32px',
                              cursor: 'pointer',
                              '&:hover': {
                                borderColor: 'primary.500',
                                color: 'primary.500',
                              },
                            })}
                          >
                            &rarr;
                          </RACButton>
                        </header>
                        <CalendarGrid>
                          {(date) => (
                            <CalendarCell
                              date={date}
                              className={css({
                                width: '32px',
                                height: '32px',
                                textAlign: 'center',
                                borderRadius: '50%',
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                                outline: 'none',
                                '&:hover': {
                                  background: 'rgba(162, 81, 252, 0.08)',
                                },
                                '&[data-selected]': {
                                  background: 'primary.500',
                                  color: 'white',
                                  fontWeight: '600',
                                },
                                '&[data-focused]': {
                                  boxShadow: '0 0 0 2px token(colors.primary.500)',
                                },
                                '&[data-disabled]': {
                                  opacity: 0.3,
                                  cursor: 'not-allowed',
                                },
                                '&[data-outside-month]': {
                                  opacity: 0.3,
                                },
                              })}
                            />
                          )}
                        </CalendarGrid>
                      </Calendar>
                    </Dialog>
                  </Popover>
                </DatePicker>

                <TimeField
                  value={scheduledTime}
                  onChange={setScheduledTime}
                  hourCycle={24}
                  granularity="minute"
                  className={css({ flex: '0.6' })}
                >
                  <Label
                    className={css({
                      fontSize: '0.75rem',
                      color: '#5F6368',
                      display: 'block',
                      marginBottom: '0.25rem',
                    })}
                  >
                    {t('scheduledTime')}
                  </Label>
                  <DateInput
                    className={css({
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      padding: '0.4rem 0.6rem',
                      border: '1.5px solid #DADCE0',
                      borderRadius: '10px',
                      background: 'white',
                      transition: 'all 0.2s ease',
                      '&:hover': {
                        borderColor: 'rgba(162, 81, 252, 0.3)',
                      },
                      '&:focus-within': {
                        borderColor: 'primary.500',
                        boxShadow: '0 0 0 3px rgba(162, 81, 252, 0.08)',
                      },
                    })}
                  >
                    {(segment) => (
                      <DateSegment
                        segment={segment}
                        className={css({
                          padding: '1px 2px',
                          borderRadius: '4px',
                          fontSize: '0.8rem',
                          outline: 'none',
                          '&[data-focused]': {
                            background: 'primary.500',
                            color: 'white',
                          },
                          '&[data-placeholder]': {
                            color: '#5F6368',
                          },
                        })}
                      />
                    )}
                  </DateInput>
                </TimeField>
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
