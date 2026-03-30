import { Screen } from '@/layout/Screen'
import { H, P, Ul } from '@/primitives'
import { HStack } from '@/styled-system/jsx'
import { useTranslation } from 'react-i18next'

/* eslint-disable @typescript-eslint/no-explicit-any */
const ensureArray = (value: any) => {
  if (Array.isArray(value)) {
    return value
  }
  return []
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const TermsOfServiceRoute = () => {
  const { t } = useTranslation('termsOfService')

  return (
    <Screen layout="centered" headerTitle={t('title')}>
      <HStack display={'block'} padding={'2rem'}>
        <P>{t('intro')}</P>

        {/* Article 1 */}
        <H lvl={2}>{t('articles.article1.title')}</H>
        <P>{t('articles.article1.content')}</P>

        {/* Article 2 */}
        <H lvl={2}>{t('articles.article2.title')}</H>
        {ensureArray(
          t('articles.article2.paragraphs', { returnObjects: true })
        ).map((paragraph, index) => (
          <P key={index}>{paragraph}</P>
        ))}

        {/* Article 3 */}
        <H lvl={2}>{t('articles.article3.title')}</H>
        {ensureArray(
          t('articles.article3.paragraphs', { returnObjects: true })
        ).map((paragraph, index) => (
          <P key={index}>{paragraph}</P>
        ))}

        {/* Article 4 */}
        <H lvl={2}>{t('articles.article4.title')}</H>
        {ensureArray(
          t('articles.article4.paragraphs', { returnObjects: true })
        ).map((paragraph, index) => (
          <P key={index}>{paragraph}</P>
        ))}

        {/* Article 5 */}
        <H lvl={2}>{t('articles.article5.title')}</H>
        <P>{t('articles.article5.content')}</P>

        {/* Article 6 */}
        <H lvl={2}>{t('articles.article6.title')}</H>
        {ensureArray(
          t('articles.article6.paragraphs', { returnObjects: true })
        ).map((paragraph, index) => (
          <P key={index}>{paragraph}</P>
        ))}
        <Ul>
          {ensureArray(
            t('articles.article6.items', { returnObjects: true })
          ).map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </Ul>
        {ensureArray(
          t('articles.article6.paragraphs2', { returnObjects: true })
        ).map((paragraph, index) => (
          <P key={index}>{paragraph}</P>
        ))}

        {/* Article 7 */}
        <H lvl={2}>{t('articles.article7.title')}</H>
        {ensureArray(
          t('articles.article7.paragraphs', { returnObjects: true })
        ).map((paragraph, index) => (
          <P key={index}>{paragraph}</P>
        ))}

        {/* Article 8 */}
        <H lvl={2}>{t('articles.article8.title')}</H>
        {ensureArray(
          t('articles.article8.paragraphs', { returnObjects: true })
        ).map((paragraph, index) => (
          <P key={index}>{paragraph}</P>
        ))}
      </HStack>
    </Screen>
  )
}
