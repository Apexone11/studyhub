/**
 * analyticsCharts.test.jsx — rendering contract for the Admin Analytics charts.
 *
 * AnalyticsTab is the only recharts consumer in the app and had no coverage,
 * so a charting major (2 -> 3 in 2026-08) could break every admin chart while
 * lint and build stayed green — imports resolving says nothing about whether
 * the SVG renders. This mounts the exact chart compositions that tab uses.
 *
 * Charts get explicit width/height rather than ResponsiveContainer: jsdom
 * reports a zero-size parent, so a responsive wrapper renders nothing and the
 * assertions would pass vacuously.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const SERIES = [
  { name: 'Mon', sheets: 4, notes: 2 },
  { name: 'Tue', sheets: 7, notes: 5 },
  { name: 'Wed', sheets: 3, notes: 9 },
]

const SLICES = [
  { name: 'Sheets', value: 12 },
  { name: 'Notes', value: 8 },
]

function renderChart(ui) {
  return render(<div data-testid="chart-host">{ui}</div>)
}

describe('Admin analytics chart primitives', () => {
  it('renders a bar chart with axes, grid, tooltip and legend', () => {
    renderChart(
      <BarChart width={480} height={240} data={SERIES}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis />
        {/* Tooltip before Legend: recharts 3 resolves z-order by render
            order, so the legend must come last to stay on top. */}
        <Tooltip />
        <Legend />
        {/* Bars and pie sectors mount through an entry animation, so they
            are absent from the DOM on first paint. Disabling animation is
            what makes the assertion deterministic. */}
        <Bar dataKey="sheets" fill="var(--sh-brand)" isAnimationActive={false} />
        <Bar dataKey="notes" fill="var(--sh-info-text)" isAnimationActive={false} />
      </BarChart>,
    )

    // Assert on rendered output (the SVG surface and the category labels
    // recharts derives from `data`) rather than internal class names,
    // which are implementation detail and churn between majors.
    const svg = screen.getByTestId('chart-host').querySelector('svg')
    expect(svg).not.toBeNull()
    for (const point of SERIES) {
      expect(screen.getByText(point.name)).toBeInTheDocument()
    }
    expect(screen.getByText('sheets')).toBeInTheDocument()
    expect(screen.getByText('notes')).toBeInTheDocument()
  })

  it('renders a line chart', () => {
    renderChart(
      <LineChart width={480} height={240} data={SERIES}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis />
        <Tooltip />
        <Line type="monotone" dataKey="sheets" stroke="var(--sh-brand)" />
      </LineChart>,
    )

    const host = screen.getByTestId('chart-host')
    expect(host.querySelector('svg')).not.toBeNull()
    for (const point of SERIES) {
      expect(screen.getByText(point.name)).toBeInTheDocument()
    }
  })

  it('renders a pie chart with per-slice cells', () => {
    renderChart(
      <PieChart width={320} height={240}>
        <Pie
          data={SLICES}
          dataKey="value"
          nameKey="name"
          outerRadius={80}
          isAnimationActive={false}
        >
          {SLICES.map((slice) => (
            <Cell key={slice.name} fill="var(--sh-brand)" />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>,
    )

    const host = screen.getByTestId('chart-host')
    expect(host.querySelector('svg')).not.toBeNull()
    expect(host.querySelectorAll('.recharts-pie-sector').length).toBe(SLICES.length)
  })
})
