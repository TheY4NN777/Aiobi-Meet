import { H, Link } from '@/primitives'
import { TabPanel, TabPanelProps } from '@/primitives/Tabs'
import { useTranslation } from 'react-i18next'
import { css } from '@/styled-system/css'

export type AboutTabProps = Pick<TabPanelProps, 'id'>

export const AboutTab = ({ id }: AboutTabProps) => {
  const { t } = useTranslation('settings')

  return (
    <TabPanel padding={'md'} flex id={id}>
      <H lvl={2}>{t('tabs.about')}</H>
      <ul
        className={css({
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          listStyle: 'none',
          padding: 0,
        })}
      >
        <li>
          <Link to="/politique-confidentialite" underline={false}>
            {t('footer.links.privacyPolicy', { ns: 'global' })}
          </Link>
        </li>
        <li>
          <Link to="/conditions-utilisation" underline={false}>
            {t('footer.links.termsOfService', { ns: 'global' })}
          </Link>
        </li>
      </ul>
    </TabPanel>
  )
}
