import { styled } from '@/styled-system/jsx'
import { css } from '@/styled-system/css'
import { A, Link } from '@/primitives'
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

const ThirdRow = styled('p', {
  base: {
    fontSize: '0.75rem',
    color: 'rgb(77 77 77)',
    textWrap: 'wrap',
    lineHeight: '1rem',
    marginTop: { base: '1rem', xs: '0.5rem' },
  },
})

export const Footer = () => {
  const { t } = useTranslation('global', { keyPrefix: 'footer' })

  return (
    <footer
      className={css({
        borderTop: '2px solid #4A3C5C',
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
              to="/mentions-legales"
              aria-label={t('links.legalsTerms')}
            >
              {t('links.legalsTerms')}
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
          <StyledLi divider>
            <Link
              underline={false}
              footer="minor"
              to="/accessibilite"
              aria-label={t('links.accessibility')}
            >
              {t('links.accessibility')}
            </Link>
          </StyledLi>
        </SecondRow>
        <ThirdRow>
          {t('mentions')}{' '}
          <A
            externalIcon
            footer="minor"
            href="https://opensource.org/licenses/MIT"
          >
            {t('license')}
          </A>
          .
          <br /> {t('links.codeAnnotation')}{' '}
          <A
            externalIcon
            footer="minor"
            href="https://github.com/TheY4NN777/Aiobi-Meet"
            aria-label={t('links.code') + ' - ' + t('links.ariaLabel')}
          >
            {t('links.code')}
          </A>
          .
        </ThirdRow>
      </InnerContainer>
    </footer>
  )
}
