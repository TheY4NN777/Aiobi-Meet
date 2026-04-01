import { styled } from '@/styled-system/jsx'
import { css } from '@/styled-system/css'
import { Link } from '@/primitives'
import { useTranslation } from 'react-i18next'

const StyledLi = styled('li', {
  base: {},
  variants: {
    divider: {
      true: {
        _after: {
          content: '""',
          display: 'inline-block',
          marginX: '.75rem',
          verticalAlign: 'middle',
          boxShadow: 'inset 0 0 0 1px #ddd',
          height: '1rem',
          width: '1px',
        },
      },
    },
  },
})

const InnerContainer = styled('div', {
  base: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'start',
    margin: 'auto',
    maxWidth: '1200px',
    paddingX: { base: '0.5rem', xs: '1rem', sm: '2rem' },
  },
})

const SecondRow = styled('ul', {
  base: {
    display: 'flex',
    borderTop: '1px solid rgb(217 217 217)',
    paddingTop: '0.5rem',
    width: '100%',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
})


export const Footer = () => {
  const { t } = useTranslation('global', { keyPrefix: 'footer' })

  return (
    <footer
      className={css({
        borderTop: '2px solid #a251fc',
        paddingY: '2rem',
        marginTop: { base: '50px', sm: '100px' },
      })}
    >
      <InnerContainer>
        <SecondRow>
          <StyledLi divider>
            <Link
              underline={false}
              footer="minor"
              to="/politique-confidentialite"
              aria-label={t('links.privacyPolicy')}
            >
              {t('links.privacyPolicy')}
            </Link>
          </StyledLi>
          <StyledLi divider>
            <Link
              underline={false}
              footer="minor"
              to="/conditions-utilisation"
              aria-label={t('links.termsOfService')}
            >
              {t('links.termsOfService')}
            </Link>
          </StyledLi>
        </SecondRow>

      </InnerContainer>
    </footer>
  )
}
