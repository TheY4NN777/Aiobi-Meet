import { useTranslation } from 'react-i18next'
import { getRouteUrl } from '@/navigation/getRouteUrl'
import { Div, Button, type DialogProps, P, Bold } from '@/primitives'
import { HStack, styled, VStack } from '@/styled-system/jsx'
import {
  Heading,
  Dialog,
  DateField,
  DateInput,
  DateSegment,
  Calendar,
  CalendarGrid,
  CalendarCell,
  Heading as CalHeading,
  Button as RACButton,
  TimeField,
  Label,
} from 'react-aria-components'
import { today, getLocalTimeZone, parseDate, parseTime } from '@internationalized/date'
import type { CalendarDate, Time } from '@internationalized/date'
import { Text, text } from '@/primitives/Text'
import {
  RiCheckLine,
  RiCloseLine,
  RiFileCopyLine,
  RiMailSendLine,
  RiSpam2Fill,
} from '@remixicon/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { css } from '@/styled-system/css'
import { useQuery } from '@tanstack/react-query'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'
import { fetchApi } from '@/api/fetchApi'
import { TimezoneSelect } from './TimezoneSelect'
import type { ApiRoom } from '@/features/rooms/api/ApiRoom'
import './PlanLaterModal.css'
import { ApiAccessLevel } from '@/features/rooms/api/ApiRoom'
import { useTelephony } from '@/features/rooms/livekit/hooks/useTelephony'
import { formatPinCode } from '@/features/rooms/utils/telephony'
import { useCopyRoomToClipboard } from '@/features/rooms/livekit/hooks/useCopyRoomToClipboard'
import { useInviteToRoom } from '@/features/rooms/api/inviteToRoom'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Parse "HH:MM" or "HH:MM:SS" into a react-aria Time, null on failure.
const parseRoomTime = (value?: string | null): Time | null => {
  if (!value) return null
  try {
    return parseTime(value.length >= 5 ? value.substring(0, 5) : value)
  } catch {
    return null
  }
}

// Parse "YYYY-MM-DD" into a react-aria CalendarDate, null on failure.
const parseRoomDate = (value?: string | null): CalendarDate | null => {
  if (!value) return null
  try {
    return parseDate(value)
  } catch {
    return null
  }
}

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

  const { data: roomDetail } = useQuery({
    queryKey: ['rooms', roomData?.id],
    queryFn: () => fetchApi<ApiRoom>(`rooms/${roomData!.id}/`),
    enabled: !!roomData?.id,
    staleTime: 60_000,
  })

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
  const [showCalendar, setShowCalendar] = useState(false)
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone)

  // Pre-fill the date/time fields when the room detail is loaded and the room
  // already has a scheduled date/time set. Without this, reopening the invite
  // dialog on an already-scheduled room shows empty fields and a subsequent
  // send would ship a null schedule, making the invitee receive an
  // "ongoing call" email instead of a "scheduled meeting" one.
  useEffect(() => {
    if (!roomDetail) return
    if (scheduledDate === null && roomDetail.scheduled_date) {
      setScheduledDate(parseRoomDate(roomDetail.scheduled_date))
    }
    if (scheduledTime === null && roomDetail.scheduled_time) {
      setScheduledTime(parseRoomTime(roomDetail.scheduled_time))
    }
    // Intentionally depend only on the loaded values, not on the local state —
    // we only want to seed on first load, not overwrite user edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomDetail?.id, roomDetail?.scheduled_date, roomDetail?.scheduled_time])

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
    // Fall back to the room's persisted schedule if the local state is still
    // null (e.g. the useQuery hasn't resolved yet, or a race during fast
    // clicks). This guarantees a scheduled room always sends a "scheduled
    // meeting" email, never an "ongoing call" one.
    const dateStr =
      scheduledDate?.toString() || roomDetail?.scheduled_date || null
    const timeStr = scheduledTime
      ? `${String(scheduledTime.hour).padStart(2, '0')}:${String(scheduledTime.minute).padStart(2, '0')}`
      : roomDetail?.scheduled_time
        ? roomDetail.scheduled_time.substring(0, 5)
        : null
    inviteMutation.mutate({
      roomId: roomData.id,
      emails,
      scheduledDate: dateStr,
      scheduledTime: timeStr,
      timezone,
    })
  }, [
    roomData?.id,
    emails,
    scheduledDate,
    scheduledTime,
    roomDetail?.scheduled_date,
    roomDetail?.scheduled_time,
    timezone,
    inviteMutation,
  ])

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

              {/* Déjà invités */}
              {roomDetail?.invited_users_info && roomDetail.invited_users_info.length > 0 && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <p className="dash-invite-label">Déjà invités</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                    {roomDetail.invited_users_info.map((u) => (
                      <span key={u.email} className="dash-invite-chip" style={{ opacity: 0.75 }}>
                        {u.full_name ? `${u.full_name} (${u.email})` : u.email}
                      </span>
                    ))}
                  </div>
                </div>
              )}

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

              {/* Date / Time — shared CSS classes */}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', width: '100%' }}>
                <DateField value={scheduledDate} onChange={setScheduledDate} className="dash-datepicker" style={{ flex: 1 }}>
                  <Label className="dash-invite-label">
                    {t('scheduledDate')}{' '}
                    <span style={{ fontStyle: 'italic' }}>({t('optional')})</span>
                  </Label>
                  <div className="dash-picker-group">
                    <DateInput className="dash-picker-input">
                      {(segment) => (
                      <DateSegment
                        segment={segment}
                        className="dash-picker-segment"
                        style={({ isFocused, isPlaceholder }) => ({
                          background: isFocused ? '#a251fc' : 'transparent',
                          color: isFocused ? '#ffffff' : isPlaceholder ? '#8b8ba3' : '#1a1a2e',
                        })}
                      />
                    )}
                    </DateInput>
                    <button type="button" className="dash-picker-btn" onClick={() => setShowCalendar(true)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    </button>
                  </div>
                </DateField>

                <TimeField value={scheduledTime} onChange={setScheduledTime} hourCycle={24} granularity="minute" className="dash-timefield" style={{ flex: 0.6 }}>
                  <Label className="dash-invite-label">{t('scheduledTime')}</Label>
                  <DateInput className="dash-picker-group">
                    {(segment) => (
                      <DateSegment
                        segment={segment}
                        className="dash-picker-segment"
                        style={({ isFocused, isPlaceholder }) => ({
                          background: isFocused ? '#a251fc' : 'transparent',
                          color: isFocused ? '#ffffff' : isPlaceholder ? '#8b8ba3' : '#1a1a2e',
                        })}
                      />
                    )}
                  </DateInput>
                </TimeField>
              </div>

              {/* Timezone */}
              <div style={{ marginTop: '0.5rem' }}>
                <label className="dash-invite-label">Fuseau horaire</label>
                <TimezoneSelect value={timezone} onChange={setTimezone} />
              </div>

              {/* Calendar modal */}
              {showCalendar && (
                // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
                <div
                  onClick={() => setShowCalendar(false)}
                  className={css({
                    position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.3)',
                    backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', zIndex: 9999,
                  })}
                >
                  {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className={css({
                      background: 'white', borderRadius: '16px', padding: '1.5rem',
                      boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
                      animation: 'fade 200ms',
                    })}
                  >
                    <Calendar
                      value={scheduledDate}
                      onChange={(d) => { setScheduledDate(d); setShowCalendar(false) }}
                      minValue={today(getLocalTimeZone())}
                    >
                      <header className={css({ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' })}>
                        <RACButton slot="previous" className={css({ background: 'none', border: '1.5px solid #ebebf0', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', '&:hover': { borderColor: 'primary.500', color: 'primary.500' } })}>&larr;</RACButton>
                        <CalHeading className={css({ fontSize: '0.85rem', fontWeight: '600' })} />
                        <RACButton slot="next" className={css({ background: 'none', border: '1.5px solid #ebebf0', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', '&:hover': { borderColor: 'primary.500', color: 'primary.500' } })}>&rarr;</RACButton>
                      </header>
                      <CalendarGrid>
                        {(date) => (
                          <CalendarCell date={date} className={css({
                            width: '36px', height: '36px', textAlign: 'center', borderRadius: '50%',
                            fontSize: '0.8rem', cursor: 'pointer', outline: 'none',
                            '&:hover': { background: 'rgba(162, 81, 252, 0.08)' },
                            '&[data-selected]': { background: 'primary.500', color: 'white', fontWeight: '600' },
                            '&[data-focused]': { boxShadow: '0 0 0 2px token(colors.primary.500)' },
                            '&[data-disabled]': { opacity: 0.3, cursor: 'not-allowed' },
                            '&[data-outside-month]': { opacity: 0.3 },
                          })} />
                        )}
                      </CalendarGrid>
                    </Calendar>
                  </div>
                </div>
              )}

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
