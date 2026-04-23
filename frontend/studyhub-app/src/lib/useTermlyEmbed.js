import { useEffect, useRef, useState } from 'react'

const TERMLY_EMBED_SCRIPT = 'https://app.termly.io/embed.min.js'

function injectTermlyScript({ forceReload = false } = {}) {
  const existing = document.getElementById('termly-jssdk')

  if (existing && !forceReload) {
    return existing
  }

  if (existing && forceReload) {
    existing.remove()
  }

  const script = document.createElement('script')
  script.id = 'termly-jssdk'
  script.src = TERMLY_EMBED_SCRIPT
  script.async = true
  script.setAttribute('data-auto-block', 'on')
  document.body.appendChild(script)
  return script
}

export default function useTermlyEmbed(
  containerRef,
  dataId,
  { enabled, timeout = 15000, onLoad, onTimeout } = {},
) {
  const [loadedId, setLoadedId] = useState(null)
  const [timedOutId, setTimedOutId] = useState(null)
  const onLoadRef = useRef(onLoad)
  const onTimeoutRef = useRef(onTimeout)

  useEffect(() => {
    onLoadRef.current = onLoad
  }, [onLoad])

  useEffect(() => {
    onTimeoutRef.current = onTimeout
  }, [onTimeout])

  useEffect(() => {
    if (!enabled || !dataId) return undefined

    const container = containerRef.current
    if (!container) return undefined

    const resetTimer = window.setTimeout(() => {
      setLoadedId((current) => (current === dataId ? null : current))
      setTimedOutId((current) => (current === dataId ? null : current))
    }, 0)

    container.replaceChildren()

    const embed = document.createElement('div')
    embed.setAttribute('name', 'termly-embed')
    embed.setAttribute('data-id', dataId)
    embed.style.display = 'block'
    container.appendChild(embed)

    const existingScript = document.getElementById('termly-jssdk')
    const script = injectTermlyScript({ forceReload: Boolean(existingScript) })

    let isLoaded = false

    const markLoaded = () => {
      if (isLoaded) return
      isLoaded = true
      window.clearTimeout(timer)
      window.clearTimeout(retryTimer)
      setTimedOutId(null)
      setLoadedId(dataId)
      onLoadRef.current?.()
      observer.disconnect()
    }

    const detectRenderedEmbed = () => {
      if (embed.children.length > 0 || embed.querySelector('iframe')) {
        markLoaded()
      }
    }

    const timer = window.setTimeout(() => {
      window.clearTimeout(retryTimer)
      setTimedOutId(dataId)
      onTimeoutRef.current?.()
    }, timeout)

    const retryTimer = window.setTimeout(() => {
      if (isLoaded) return
      injectTermlyScript({ forceReload: true })
    }, 1200)

    const observer = new MutationObserver(() => {
      detectRenderedEmbed()
    })

    observer.observe(embed, { childList: true, subtree: true })
    script.addEventListener('load', detectRenderedEmbed)

    return () => {
      observer.disconnect()
      window.clearTimeout(resetTimer)
      window.clearTimeout(timer)
      window.clearTimeout(retryTimer)
      script.removeEventListener('load', detectRenderedEmbed)
      container.replaceChildren()
    }
  }, [containerRef, dataId, enabled, timeout])

  return {
    loaded: Boolean(enabled && dataId && loadedId === dataId),
    timedOut: Boolean(enabled && dataId && timedOutId === dataId),
  }
}
