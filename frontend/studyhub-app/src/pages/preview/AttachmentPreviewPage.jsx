import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import Navbar from '../../components/navbar/Navbar'
import { IconArrowLeft, IconDownload, IconEye } from '../../components/Icons'
import { API } from '../../config'
import { getApiErrorMessage, readJsonSafely } from '../../lib/http'
import { pageShell } from '../../lib/ui'

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif'])
const TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'json',
  'yaml',
  'yml',
  'csv',
  'xml',
  'html',
  'htm',
  'js',
  'jsx',
  'ts',
  'tsx',
  'css',
  'log',
  'ini',
  'env',
])

function authHeaders() {
  return { 'Content-Type': 'application/json' }
}

function attachmentExtension(name = '') {
  const dotIndex = String(name).lastIndexOf('.')
  if (dotIndex < 0) return ''
  return String(name)
    .slice(dotIndex + 1)
    .toLowerCase()
}

function attachmentPreviewKind(attachmentType, attachmentName) {
  const rawType = String(attachmentType || '').toLowerCase()
  const extension = attachmentExtension(attachmentName)

  if (rawType === 'pdf' || extension === 'pdf') return 'pdf'
  if (rawType === 'image' || rawType.startsWith('image/') || IMAGE_EXTENSIONS.has(extension))
    return 'image'
  if (
    TEXT_EXTENSIONS.has(extension) ||
    rawType.startsWith('text/') ||
    rawType.includes('json') ||
    rawType.includes('xml')
  ) {
    return 'text'
  }
  return 'document'
}

function scopeConfig(scope, id) {
  if (scope === 'feed-post') {
    return {
      label: 'Feed post attachment',
      backPath: '/feed',
      detailUrl: `${API}/api/feed/posts/${id}`,
      previewUrl: `${API}/api/feed/posts/${id}/attachment/preview`,
      downloadUrl: `${API}/api/feed/posts/${id}/attachment`,
    }
  }

  if (scope === 'sheet') {
    return {
      label: 'Sheet attachment',
      backPath: `/sheets/${id}`,
      detailUrl: `${API}/api/sheets/${id}`,
      previewUrl: `${API}/api/sheets/${id}/attachment/preview`,
      downloadUrl: `${API}/api/sheets/${id}/attachment`,
    }
  }

  return null
}

function panelStyle() {
  return {
    background: 'var(--sh-surface)',
    borderRadius: 18,
    border: '1px solid #e2e8f0',
    padding: 18,
  }
}

function linkButton() {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
    minHeight: 34,
    borderRadius: 12,
    border: '1px solid var(--sh-border)',
    background: 'var(--sh-surface)',
    color: 'var(--sh-heading)',
    padding: '7px 12px',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.01em',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)',
  }
}

function primaryLinkButton() {
  return {
    ...linkButton(),
    borderColor: 'var(--sh-brand)',
    background: 'var(--sh-brand)',
    color: '#fff',
    boxShadow: '0 10px 22px rgba(37, 99, 235, 0.18)',
  }
}

export default function AttachmentPreviewPage() {
  const { scope, id } = useParams()
  const [state, setState] = useState({ loading: true, error: '', detail: null })
  const numericId = Number.parseInt(id, 10)

  const config = useMemo(() => {
    if (!Number.isInteger(numericId)) return null
    return scopeConfig(scope, numericId)
  }, [scope, numericId])

  const loadDetail = useCallback(async () => {
    if (!config) return

    try {
      const response = await fetch(config.detailUrl, {
        headers: authHeaders(),
        credentials: 'include',
      })
      const data = await readJsonSafely(response, {})

      if (response.status === 403) {
        setState({
          loading: false,
          error: getApiErrorMessage(data, 'You do not have access to this attachment preview.'),
          detail: null,
        })
        return
      }

      if (!response.ok) {
        throw new Error(getApiErrorMessage(data, 'Could not load this attachment preview.'))
      }

      if (!data.hasAttachment) {
        throw new Error('No attachment available for this item.')
      }

      setState({ loading: false, error: '', detail: data })
    } catch (error) {
      setState({
        loading: false,
        error: error.message || 'Could not load this attachment preview.',
        detail: null,
      })
    }
  }, [config])

  useEffect(() => {
    if (!config) return
    setState({ loading: true, error: '', detail: null })
    void loadDetail()
  }, [config, loadDetail])

  if (!config) return <Navigate to="/feed" replace />

  const previewKind = attachmentPreviewKind(
    state.detail?.attachmentType,
    state.detail?.attachmentName,
  )

  return (
    <>
      <Navbar />
      <div style={{ background: 'var(--sh-bg)', minHeight: '100vh', fontFamily: FONT }}>
        <div style={pageShell('reading', 26, 48)}>
          <main id="main-content" style={{ display: 'grid', gap: 16 }}>
            <section style={panelStyle()}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <h1
                    style={{
                      margin: 0,
                      fontSize: 24,
                      color: 'var(--sh-heading)',
                      display: 'flex',
                      gap: 10,
                      alignItems: 'center',
                    }}
                  >
                    <IconEye size={20} />
                    Attachment Preview
                  </h1>
                  <div style={{ marginTop: 6, color: 'var(--sh-muted)', fontSize: 13 }}>
                    {config.label}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Link to={config.backPath} style={linkButton()}>
                    <IconArrowLeft size={14} />
                    Back
                  </Link>
                  {state.detail?.allowDownloads !== false ? (
                    <a href={config.downloadUrl} style={primaryLinkButton()}>
                      <IconDownload size={14} />
                      Download original
                    </a>
                  ) : null}
                </div>
              </div>
            </section>

            {state.error ? (
              <section
                style={{
                  ...panelStyle(),
                  background: 'var(--sh-danger-bg)',
                  borderColor: 'var(--sh-danger-border)',
                  color: 'var(--sh-danger)',
                  fontSize: 14,
                }}
              >
                {state.error}
              </section>
            ) : null}

            {state.loading ? (
              <section style={panelStyle()}>
                <div style={{ color: 'var(--sh-muted)', fontSize: 14 }}>Loading preview...</div>
              </section>
            ) : state.detail ? (
              <section style={panelStyle()}>
                <div style={{ fontSize: 12, color: 'var(--sh-muted)', marginBottom: 12 }}>
                  {state.detail.attachmentName || 'Attachment'}
                </div>
                <div
                  style={{
                    border: '1px solid var(--sh-border)',
                    borderRadius: 14,
                    background: 'var(--sh-surface)',
                    overflow: 'hidden',
                    minHeight: 420,
                  }}
                >
                  {previewKind === 'image' ? (
                    <img
                      src={config.previewUrl}
                      alt={state.detail.attachmentName || 'Attachment preview'}
                      loading="lazy"
                      style={{
                        width: '100%',
                        maxHeight: '80vh',
                        objectFit: 'contain',
                        display: 'block',
                      }}
                    />
                  ) : (
                    <iframe
                      src={config.previewUrl}
                      title={`Attachment preview ${scope}-${numericId}`}
                      sandbox="allow-same-origin"
                      referrerPolicy="no-referrer"
                      style={{ width: '100%', height: '80vh', border: 'none' }}
                    />
                  )}
                </div>
              </section>
            ) : null}
          </main>
        </div>
      </div>
    </>
  )
}
