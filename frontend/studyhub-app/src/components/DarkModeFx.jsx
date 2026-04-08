const ORBS = [
  {
    id: 'brand',
    tone: 'brand',
    size: '38rem',
    top: '-8rem',
    left: '-10rem',
    blur: '0px',
    duration: '22s',
    delay: '0s',
  },
  {
    id: 'violet',
    tone: 'violet',
    size: '30rem',
    top: '24%',
    right: '-8rem',
    blur: '10px',
    duration: '26s',
    delay: '-8s',
  },
  {
    id: 'cyan',
    tone: 'cyan',
    size: '22rem',
    bottom: '14%',
    left: '18%',
    blur: '6px',
    duration: '20s',
    delay: '-3s',
  },
]

const PARTICLES = [
  { id: 1, size: '4px', top: '14%', left: '12%', duration: '15s', delay: '0s' },
  { id: 2, size: '6px', top: '22%', left: '76%', duration: '18s', delay: '-5s' },
  { id: 3, size: '3px', top: '40%', left: '34%', duration: '14s', delay: '-2s' },
  { id: 4, size: '5px', top: '56%', left: '88%', duration: '19s', delay: '-9s' },
  { id: 5, size: '4px', top: '72%', left: '18%', duration: '16s', delay: '-6s' },
  { id: 6, size: '7px', top: '78%', left: '62%', duration: '21s', delay: '-4s' },
  { id: 7, size: '3px', top: '10%', left: '52%', duration: '13s', delay: '-7s' },
  { id: 8, size: '5px', top: '88%', left: '44%', duration: '17s', delay: '-11s' },
]

export default function DarkModeFx() {
  return (
    <div aria-hidden="true" className="sh-dark-mode-fx">
      <div className="sh-dark-mode-fx__veil" />
      <div className="sh-dark-mode-fx__mesh" />

      {ORBS.map((orb) => (
        <span
          key={orb.id}
          className={`sh-dark-mode-fx__orb sh-dark-mode-fx__orb--${orb.tone}`}
          style={{
            '--fx-size': orb.size,
            '--fx-top': orb.top || 'auto',
            '--fx-right': orb.right || 'auto',
            '--fx-bottom': orb.bottom || 'auto',
            '--fx-left': orb.left || 'auto',
            '--fx-blur': orb.blur,
            '--fx-duration': orb.duration,
            '--fx-delay': orb.delay,
          }}
        />
      ))}

      <span className="sh-dark-mode-fx__beam sh-dark-mode-fx__beam--left" />
      <span className="sh-dark-mode-fx__beam sh-dark-mode-fx__beam--right" />

      {PARTICLES.map((particle) => (
        <span
          key={particle.id}
          className="sh-dark-mode-fx__particle"
          style={{
            '--fx-size': particle.size,
            '--fx-top': particle.top,
            '--fx-left': particle.left,
            '--fx-duration': particle.duration,
            '--fx-delay': particle.delay,
          }}
        />
      ))}
    </div>
  )
}