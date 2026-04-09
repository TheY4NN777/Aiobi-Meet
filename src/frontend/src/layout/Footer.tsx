import { css } from '@/styled-system/css'

export const Footer = () => {
  return (
    <footer
      className={css({
        borderTop: '2px solid #a251fc',
        paddingY: '1rem',
        marginTop: { base: '50px', sm: '100px' },
      })}
    />
  )
}
