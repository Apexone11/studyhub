// pageScaffold centralizes the lightweight page chrome shared by the secondary app routes.
import { cloneElement, isValidElement } from 'react'
import { pageShell, useResponsiveAppLayout } from '../../lib/ui'
import { PAGE_FONT } from './pageUtils'

export function PageShell({ nav, sidebar, children }) {
  const layout = useResponsiveAppLayout()
  const responsiveSidebar = isValidElement(sidebar)
    ? cloneElement(sidebar, { mode: layout.sidebarMode })
    : sidebar

  return (
    <div style={{ minHeight: '100vh', background: '#edf0f5', fontFamily: PAGE_FONT }}>
      {nav}
      <div style={pageShell('app')}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: layout.columns.appTwoColumn,
            gap: 20,
            alignItems: 'start',
          }}
        >
          <div style={{ position: layout.isCompact ? 'static' : 'sticky', top: layout.isCompact ? undefined : 74 }}>
            {responsiveSidebar}
          </div>
          <main>{children}</main>
        </div>
      </div>
    </div>
  )
}

export function TeaserCard({ title, sub, chips = [] }) {
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 14,
        border: '1px solid #e2e8f0',
        padding: '14px 16px',
        marginBottom: 9,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          background: '#f1f5f9',
          fontSize: 9,
          fontWeight: 600,
          color: '#64748b',
          padding: '3px 10px',
          borderRadius: '0 0 0 8px',
        }}
      >
        Version 2
      </span>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#334155', marginBottom: 5, paddingRight: 64 }}>{title}</div>
      <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.55, marginBottom: 8 }}>{sub}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {chips.map((chip, index) => (
          <span
            key={index}
            style={{
              fontSize: 10,
              padding: '2px 8px',
              borderRadius: 99,
              background: chip.bg || '#f1f5f9',
              color: chip.color || '#64748b',
              border: chip.border ? `1px solid ${chip.border}` : 'none',
            }}
          >
            {chip.label}
          </span>
        ))}
      </div>
      <div style={{ height: 4, background: '#f1f5f9', borderRadius: 99, marginTop: 10 }} />
    </div>
  )
}

export function MiniPreview({ md }) {
  if (!md) {
    return <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>Start typing to see a live preview…</div>
  }

  const escapeHtml = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const lines = md.split('\n')
  const nodes = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    const headingMatch = line.match(/^(#{1,4})\s+(.+)/)

    if (headingMatch) {
      const level = headingMatch[1].length
      const size = [20, 16, 14, 13][level - 1]
      nodes.push(
        <div
          key={index}
          style={{
            fontSize: size,
            fontWeight: 700,
            color: '#0f172a',
            margin: level === 1 ? '0 0 10px' : '8px 0 4px',
            borderBottom: level <= 2 ? '1px solid #f1f5f9' : 'none',
            paddingBottom: level <= 2 ? 5 : 0,
          }}
        >
          {headingMatch[2]}
        </div>,
      )
      index += 1
      continue
    }

    if (line.match(/^```/)) {
      const language = line.slice(3).trim()
      let code = ''
      index += 1

      while (index < lines.length && !lines[index].match(/^```/)) {
        code += `${escapeHtml(lines[index])}\n`
        index += 1
      }

      nodes.push(
        <div key={index} style={{ background: '#0f172a', borderRadius: 9, padding: '12px 14px', marginBottom: 10 }}>
          {language ? <div style={{ fontSize: 9, color: '#64748b', letterSpacing: '.08em', marginBottom: 6 }}>{language.toUpperCase()}</div> : null}
          <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: 11, color: '#e2e8f0', lineHeight: 1.7, overflowX: 'auto' }}>{code}</pre>
        </div>,
      )
      index += 1
      continue
    }

    if (line.startsWith('> ')) {
      nodes.push(
        <div
          key={index}
          style={{
            borderLeft: '3px solid #3b82f6',
            background: '#eff6ff',
            padding: '8px 12px',
            borderRadius: '0 8px 8px 0',
            marginBottom: 8,
          }}
        >
          <div style={{ fontSize: 12, color: '#1e40af', fontStyle: 'italic' }}>{line.slice(2)}</div>
        </div>,
      )
      index += 1
      continue
    }

    if (line.match(/^[-*+]\s/)) {
      const items = []
      while (index < lines.length && lines[index].match(/^[-*+]\s/)) {
        items.push(lines[index].slice(2))
        index += 1
      }
      nodes.push(
        <ul key={`ul${index}`} style={{ margin: '0 0 8px 18px', padding: 0 }}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex} style={{ fontSize: 12, color: '#334155', lineHeight: 1.7 }}>
              {item}
            </li>
          ))}
        </ul>,
      )
      continue
    }

    if (line.trim() === '') {
      nodes.push(<div key={index} style={{ height: 8 }} />)
      index += 1
      continue
    }

    nodes.push(
      <p key={index} style={{ fontSize: 12, color: '#334155', lineHeight: 1.7, margin: '0 0 6px' }}>
        {line}
      </p>,
    )
    index += 1
  }

  return <>{nodes}</>
}
