import { A, Badge, Button, DialogProps, Field, H, Link, P } from '@/primitives'
import { Trans, useTranslation } from 'react-i18next'
import { useRoomContext } from '@livekit/components-react'
import { useUser } from '@/features/auth'
import { css } from '@/styled-system/css'
import { TabPanel, TabPanelProps } from '@/primitives/Tabs'
import { HStack } from '@/styled-system/jsx'
import { useState } from 'react'
import { LoginButton } from '@/components/LoginButton'
import { usePersistentUserChoices } from '@/features/rooms/livekit/hooks/usePersistentUserChoices'

export type AccountTabProps = Pick<DialogProps, 'onOpenChange'> &
  Pick<TabPanelProps, 'id'>

export const AccountTab = ({ id, onOpenChange }: AccountTabProps) => {
  const { t } = useTranslation('settings')
  const { saveUsername } = usePersistentUserChoices()
  const room = useRoomContext()
  const { user, isLoggedIn, logout } = useUser()
  const [name, setName] = useState(room?.localParticipant.name ?? '')
  const userDisplay =
    user?.full_name && user?.email
      ? `${user.full_name} (${user.email})`
      : user?.email

  const handleOnSubmit = () => {
    if (room) room.localParticipant.setName(name)
    saveUsername(name)
    if (onOpenChange) onOpenChange(false)
  }
  const handleOnCancel = () => {
    if (onOpenChange) onOpenChange(false)
  }

  return (
    <TabPanel padding={'md'} flex id={id}>
      <H lvl={2}>{t('account.heading')}</H>
      <Field
        type="text"
        label={t('account.nameLabel')}
        value={name}
        onChange={setName}
        validate={(value) => {
          return !value ? <p>{t('account.nameError')}</p> : null
        }}
      />
      <H lvl={2}>{t('account.authentication')}</H>
      {isLoggedIn ? (
        <>
          <P>
            <Trans
              i18nKey="settings:account.currentlyLoggedAs"
              values={{ user: userDisplay }}
              components={[<Badge />]}
            />
          </P>
          <P>
            <A onPress={logout}>{t('logout', { ns: 'global' })}</A>
          </P>
        </>
      ) : (
        <>
          <P>{t('account.youAreNotLoggedIn')}</P>
          <LoginButton />
        </>
      )}
      <H lvl={2}>{t('account.legal', { defaultValue: 'Legal' })}</H>
      <P>
        <Link to="/politique-confidentialite" underline={false}>
          {t('footer.links.privacyPolicy', { ns: 'global' })}
        </Link>
      </P>
      <P>
        <Link to="/conditions-utilisation" underline={false}>
          {t('footer.links.termsOfService', { ns: 'global' })}
        </Link>
      </P>
      <HStack
        className={css({
          marginTop: 'auto',
          marginLeft: 'auto',
        })}
      >
        <Button variant="secondary" onPress={handleOnCancel}>
          {t('cancel', { ns: 'global' })}
        </Button>
        <Button variant={'primary'} onPress={handleOnSubmit}>
          {t('submit', { ns: 'global' })}
        </Button>
      </HStack>
    </TabPanel>
  )
}
