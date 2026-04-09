import { useEffect, useRef, useState } from 'react'

const TZ_OPTIONS = [
  { value: 'UTC', label: 'UTC (GMT+0)' },
  { value: 'Africa/Abidjan', label: 'Abidjan — GMT+0' },
  { value: 'Africa/Lagos', label: 'Lagos / Dakar — WAT (GMT+1)' },
  { value: 'Africa/Cairo', label: 'Le Caire — GMT+2' },
  { value: 'Africa/Nairobi', label: 'Nairobi — EAT (GMT+3)' },
  { value: 'Europe/Paris', label: 'Paris — CET (GMT+1/+2)' },
  { value: 'America/New_York', label: 'New York — EST (GMT-5/-4)' },
]

interface TimezoneSelectProps {
  value: string
  onChange: (value: string) => void
}

export function TimezoneSelect({ value, onChange }: TimezoneSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const selected = TZ_OPTIONS.find((o) => o.value === value) ?? TZ_OPTIONS[0]

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div
        className="dash-picker-group"
        style={{ justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setOpen((o) => !o)}
      >
        <span style={{ fontSize: '0.85rem', color: '#1a1a2e', flex: 1 }}>
          {selected.label}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#4A3C5C"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            flexShrink: 0,
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s',
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: '#fff',
            border: '1.5px solid #ebebf0',
            borderRadius: '10px',
            zIndex: 200,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            overflow: 'hidden',
          }}
        >
          {TZ_OPTIONS.map((opt) => (
            <div
              key={opt.value}
              onMouseDown={() => {
                onChange(opt.value)
                setOpen(false)
              }}
              style={{
                padding: '0.5rem 0.75rem',
                fontSize: '0.85rem',
                cursor: 'pointer',
                color: opt.value === value ? '#a251fc' : '#1a1a2e',
                background:
                  opt.value === value ? 'rgba(162,81,252,0.07)' : 'transparent',
                fontWeight: opt.value === value ? 500 : 400,
              }}
              onMouseEnter={(e) => {
                if (opt.value !== value)
                  (e.currentTarget as HTMLDivElement).style.background = 'rgba(162,81,252,0.06)'
              }}
              onMouseLeave={(e) => {
                if (opt.value !== value)
                  (e.currentTarget as HTMLDivElement).style.background = 'transparent'
              }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
