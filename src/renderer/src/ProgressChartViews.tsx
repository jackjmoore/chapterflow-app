import { useState } from 'react'
import type { CumulativePoint, DayPoint } from './progressCharts'

/**
 * The Progress page's visuals, hand-rolled SVG like the session analytics —
 * no chart library, and deliberately plain: single accent series, muted
 * dashed reference line, recessive grid, values in ink tokens (never the
 * series color), per-mark hover tooltips. Numbers and honest state, nothing
 * celebratory.
 */

const WIDTH = 900
const DEFAULT_HEIGHT = 220
const PAD = { top: 16, right: 12, bottom: 26, left: 52 }

export function formatShortDate(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function niceMax(value: number): number {
  if (value <= 0) return 1
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)))
  const scaled = value / magnitude
  const nice = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10
  return nice * magnitude
}

/** Monday-first weekday index for a local date key. */
function mondayIndex(key: string): number {
  const [y, m, d] = key.split('-').map(Number)
  return (new Date(y, m - 1, d).getDay() + 6) % 7
}

/**
 * Total words over time against the straight line needed to hit the deadline
 * from the start date. The required line is a reference, not a series —
 * muted and dashed, labeled once.
 */
export function CumulativeChart(props: {
  points: CumulativePoint[]
  target: number | null
  deadline: string | null
  startDate: string | null
  startCount: number | null
  /** Hero placement gets a taller plot; the default matches the old panel scale. */
  height?: number
}): JSX.Element {
  const { points, target, deadline, startDate, startCount } = props
  const height = props.height ?? DEFAULT_HEIGHT
  const [hover, setHover] = useState<number | null>(null)

  if (points.length === 0) return <p className="progress-hint">No writing sessions recorded yet.</p>

  const hasReference = target != null && deadline != null && startDate != null && startCount != null
  const firstDate = points[0].date
  const lastDate = hasReference && deadline > points[points.length - 1].date ? deadline : points[points.length - 1].date

  const toTime = (key: string): number => new Date(key + 'T00:00:00').getTime()
  const t0 = toTime(firstDate)
  const t1 = Math.max(toTime(lastDate), t0 + 1)

  const yMax = niceMax(
    Math.max(points[points.length - 1].total, target ?? 0, points[0].total, 1)
  )
  const plotW = WIDTH - PAD.left - PAD.right
  const plotH = height - PAD.top - PAD.bottom
  const x = (key: string): number => PAD.left + ((toTime(key) - t0) / (t1 - t0)) * plotW
  const y = (total: number): number => PAD.top + plotH - (total / yMax) * plotH

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.date).toFixed(1)},${y(p.total).toFixed(1)}`).join(' ')
  const baseline = PAD.top + plotH
  const area = `${path} L${x(points[points.length - 1].date).toFixed(1)},${baseline} L${x(firstDate).toFixed(1)},${baseline} Z`

  return (
    <figure className="progress-chart" aria-label="Total words over time">
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        role="img"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const px = ((e.clientX - rect.left) / rect.width) * WIDTH
          let best = 0
          let bestDist = Infinity
          points.forEach((p, i) => {
            const d = Math.abs(x(p.date) - px)
            if (d < bestDist) {
              bestDist = d
              best = i
            }
          })
          setHover(best)
        }}
      >
        {[0.5, 1].map((f) => (
          <g key={f}>
            <line
              className="progress-chart-grid"
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(yMax * f)}
              y2={y(yMax * f)}
            />
            <text className="progress-chart-axis" x={PAD.left - 6} y={y(yMax * f) + 3} textAnchor="end">
              {Math.round(yMax * f).toLocaleString()}
            </text>
          </g>
        ))}
        <line
          className="progress-chart-zero"
          x1={PAD.left}
          x2={WIDTH - PAD.right}
          y1={baseline}
          y2={baseline}
        />
        <path className="progress-chart-area" d={area} stroke="none" />
        {hasReference && (
          <g>
            <line
              className="progress-chart-reference"
              x1={x(startDate! < firstDate ? firstDate : startDate!)}
              y1={y(startCount!)}
              x2={x(deadline!)}
              y2={y(target!)}
            />
            <text className="progress-chart-axis" x={x(deadline!)} y={y(target!) - 6} textAnchor="end">
              needed pace
            </text>
          </g>
        )}
        <path className="progress-chart-line" d={path} fill="none" />
        {hover != null && (
          <g>
            <line
              className="progress-chart-crosshair"
              x1={x(points[hover].date)}
              x2={x(points[hover].date)}
              y1={PAD.top}
              y2={baseline}
            />
            <circle className="progress-chart-dot" cx={x(points[hover].date)} cy={y(points[hover].total)} r={4} />
            <text
              className="progress-chart-tooltip"
              x={Math.min(Math.max(x(points[hover].date), PAD.left + 60), WIDTH - PAD.right - 60)}
              y={PAD.top + 4}
              textAnchor="middle"
            >
              {formatShortDate(points[hover].date)} · {points[hover].total.toLocaleString()} words
            </text>
          </g>
        )}
        <text className="progress-chart-axis" x={PAD.left} y={height - 8} textAnchor="start">
          {formatShortDate(firstDate)}
        </text>
        <text className="progress-chart-axis" x={WIDTH - PAD.right} y={height - 8} textAnchor="end">
          {formatShortDate(lastDate)}
        </text>
      </svg>
    </figure>
  )
}

const CAL_CELL = 12
const CAL_GAP = 3
const CAL_PITCH = CAL_CELL + CAL_GAP
const CAL_GUTTER = 30
const CAL_TOP = 20

/** Fixed daily buckets (words) — the same meaning in every project, rather
 *  than quantiles that would grade each manuscript on its own curve. */
const CAL_LEVELS = [400, 800, 1200]

function calLevel(words: number): string {
  if (words < 0) return 'is-negative'
  if (words === 0) return ''
  if (words <= CAL_LEVELS[0]) return 'is-l1'
  if (words <= CAL_LEVELS[1]) return 'is-l2'
  if (words <= CAL_LEVELS[2]) return 'is-l3'
  return 'is-l4'
}

const CAL_DAY_LABELS = [
  { label: 'Mon', row: 0 },
  { label: 'Wed', row: 2 },
  { label: 'Fri', row: 4 }
]

/**
 * Daily words as a calendar: columns are Monday-start weeks, one cell per
 * day, shaded on a fixed ramp of the accent hue. Rendered at natural size
 * (never stretched) so a short history doesn't become a wall of huge cells.
 */
export function WritingCalendar(props: { days: DayPoint[] }): JSX.Element {
  const { days } = props
  const [hover, setHover] = useState<number | null>(null)

  if (days.length === 0) return <p className="progress-hint">No writing sessions recorded yet.</p>

  const startPad = mondayIndex(days[0].date)
  const weeks = Math.ceil((startPad + days.length) / 7)
  const width = CAL_GUTTER + weeks * CAL_PITCH - CAL_GAP
  const height = CAL_TOP + 7 * CAL_PITCH - CAL_GAP

  return (
    <figure className="progress-calendar" aria-label="Words written per day">
      <svg width={width} height={height} role="img">
        {hover != null && (
          <text
            className="progress-chart-tooltip"
            x={CAL_GUTTER + (width - CAL_GUTTER) / 2}
            y={12}
            textAnchor="middle"
          >
            {formatShortDate(days[hover].date)} · {days[hover].words.toLocaleString()} words
          </text>
        )}
        {CAL_DAY_LABELS.map(({ label, row }) => (
          <text
            key={label}
            className="progress-chart-axis"
            x={CAL_GUTTER - 6}
            y={CAL_TOP + row * CAL_PITCH + CAL_CELL - 2}
            textAnchor="end"
          >
            {label}
          </text>
        ))}
        {days.map((day, i) => {
          const col = Math.floor((startPad + i) / 7)
          const row = (startPad + i) % 7
          return (
            <rect
              key={day.date}
              className={`progress-cal-cell ${calLevel(day.words)} ${hover === i ? 'is-hover' : ''}`}
              x={CAL_GUTTER + col * CAL_PITCH}
              y={CAL_TOP + row * CAL_PITCH}
              width={CAL_CELL}
              height={CAL_CELL}
              rx={3}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          )
        })}
      </svg>
      <figcaption className="progress-cal-legend">
        <span>0</span>
        <span className="progress-cal-swatch" />
        <span className="progress-cal-swatch is-l1" />
        <span className="progress-cal-swatch is-l2" />
        <span className="progress-cal-swatch is-l3" />
        <span className="progress-cal-swatch is-l4" />
        <span>{CAL_LEVELS[CAL_LEVELS.length - 1].toLocaleString()}+</span>
      </figcaption>
    </figure>
  )
}

/** The last fortnight's shape beside the This-week fact — no axes; cutting
 *  days sit on the baseline rather than diving below it at this size. */
export function Sparkline(props: { days: DayPoint[] }): JSX.Element | null {
  const { days } = props
  if (days.length < 2) return null

  const W = 100
  const H = 30
  const padY = 2
  const max = Math.max(...days.map((d) => Math.abs(d.words)), 1)
  const pts = days
    .map((d, i) => {
      const px = (i / (days.length - 1)) * (W - 4) + 2
      const py = H - padY - (Math.max(d.words, 0) / max) * (H - 2 * padY)
      return `${px.toFixed(1)},${py.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg className="progress-spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Words per day, last 14 days">
      <polyline points={pts} />
    </svg>
  )
}
