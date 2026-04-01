import { Screen } from '@/layout/Screen'
import { H, P, Ul } from '@/primitives'
import { css } from '@/styled-system/css'
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

const tableStyle = css({
  width: '100%',
  borderCollapse: 'collapse',
  marginTop: '1rem',
  marginBottom: '1rem',
  '& th, & td': {
    border: '1px solid #ddd',
    padding: '0.75rem',
    textAlign: 'left',
    fontSize: '0.9rem',
  },
  '& th': {
    backgroundColor: '#a251fc',
    color: '#F8F8F9',
    fontWeight: 'bold',
  },
  '& tr:nth-child(even)': {
    backgroundColor: '#f9f9f9',
  },
})

export const LegalTermsRoute = () => {
  const { t } = useTranslation('legals')

  const tableHeaders = ensureArray(
    t('section2.table.headers', { returnObjects: true })
  )
  const tableRows = ensureArray(
    t('section2.table.rows', { returnObjects: true })
  )

  return (
    <Screen layout="centered" headerTitle={t('title')}>
      <HStack display={'block'} padding={'2rem'}>
        {/* Préambule */}
        <H lvl={2}>{t('preamble.title')}</H>
        {ensureArray(
          t('preamble.paragraphs', { returnObjects: true })
        ).map((paragraph, index) => (
          <P key={index}>{paragraph}</P>
        ))}

        {/* 1. Responsable de traitement */}
        <H lvl={2}>{t('section1.title')}</H>
        <P>{t('section1.content')}</P>

        {/* 2. Objet du traitement de données */}
        <H lvl={2}>{t('section2.title')}</H>
        <table className={tableStyle}>
          <thead>
            <tr>
              {tableHeaders.map((header, index) => (
                <th key={index}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {ensureArray(row).map((cell, cellIndex) => (
                  <td key={cellIndex}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {/* 3. Destinataires des données */}
        <H lvl={2}>{t('section3.title')}</H>
        <P>{t('section3.intro')}</P>
        <Ul>
          {ensureArray(
            t('section3.items', { returnObjects: true })
          ).map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </Ul>
        <P>{t('section3.outro')}</P>

        {/* 4. Les cookies */}
        <H lvl={2}>{t('section4.title')}</H>
        {ensureArray(
          t('section4.paragraphs', { returnObjects: true })
        ).map((paragraph, index) => (
          <P key={index}>{paragraph}</P>
        ))}

        {/* 5. Sécurité des données */}
        <H lvl={2}>{t('section5.title')}</H>
        {ensureArray(
          t('section5.paragraphs', { returnObjects: true })
        ).map((paragraph, index) => (
          <P key={index}>{paragraph}</P>
        ))}

        {/* 6. Vos droits */}
        <H lvl={2}>{t('section6.title')}</H>
        <P>{t('section6.intro')}</P>
        <Ul>
          {ensureArray(
            t('section6.rights', { returnObjects: true })
          ).map(
            (
              right: { name: string; description: string },
              index: number
            ) => (
              <li key={index}>
                <strong>{right.name}</strong> : {right.description}
              </li>
            )
          )}
        </Ul>

        {/* 7. Coordonnées du DPO */}
        <H lvl={2}>{t('section7.title')}</H>
        {ensureArray(
          t('section7.paragraphs', { returnObjects: true })
        ).map((paragraph, index) => (
          <P key={index}>{paragraph}</P>
        ))}
      </HStack>
    </Screen>
  )
}
