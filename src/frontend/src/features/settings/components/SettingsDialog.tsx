import { Trans, useTranslation } from 'react-i18next'
import { useLanguageLabels } from '@/i18n/useLanguageLabels'
import { A, Badge, Dialog, type DialogProps, Field, H, Link, P } from '@/primitives'
import { useUser } from '@/features/auth'
import { LoginButton } from '@/components/LoginButton'

export type SettingsDialogProps = Pick<DialogProps, 'isOpen' | 'onOpenChange'>

export const SettingsDialog = (props: SettingsDialogProps) => {
  const { t, i18n } = useTranslation('settings')
  const { user, isLoggedIn, logout } = useUser()
  const { languagesList, currentLanguage } = useLanguageLabels()
  const userDisplay =
    user?.full_name && user?.email
      ? `${user.full_name} (${user.email})`
      : user?.email
  return (
    <Dialog title={t('dialog.heading')} {...props}>
      <H lvl={2}>{t('account.heading')}</H>
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
      <H lvl={2}>{t('language.heading')}</H>
      <Field
        type="select"
        label={t('language.label')}
        items={languagesList}
        defaultSelectedKey={currentLanguage.key}
        onSelectionChange={(lang) => {
          i18n.changeLanguage(lang as string)
        }}
      />
      <H lvl={2}>{t('tabs.about', { defaultValue: 'About' })}</H>
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
    </Dialog>
  )
}
