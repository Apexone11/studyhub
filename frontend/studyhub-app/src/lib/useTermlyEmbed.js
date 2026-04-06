import { useEffect, useRef, useState } from 'react'

const TERMLY_EMBED_SCRIPT = 'https://app.termly.io/embed.min.js'

export default function useTermlyEmbed(containerRef, dataId, { enabled, timeout = 15000, onLoad, onTimeout } = {}) {
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

    if (!document.getElementById('termly-jssdk')) {
      const script = document.createElement('script')
      script.id = 'termly-jssdk'
      script.src = TERMLY_EMBED_SCRIPT
      script.setAttribute('data-auto-block', 'on')
      document.body.appendChild(script)
    }

    const embed = document.createElement('div')
    embed.setAttribute('name', 'termly-embed')
    embed.setAttribute('data-id', dataId)
    container.appendChild(embed)

    const timer = window.setTimeout(() => {
      setTimedOutId(dataId)
      onTimeoutRef.current?.()
    }, timeout)

    const observer = new MutationObserver(() => {
      if (embed.children.length > 0) {
        window.clearTimeout(timer)
        setTimedOutId(null)
        setLoadedId(dataId)
        onLoadRef.current?.()
        observer.disconnect()
      }
    })

    observer.observe(embed, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      window.clearTimeout(timer)
      if (embed.parentNode === container) {
        container.removeChild(embed)
      }
    }
  }, [containerRef, dataId, enabled, timeout])

  return {
    loaded: Boolean(enabled && dataId && loadedId === dataId),
    timedOut: Boolean(enabled && dataId && timedOutId === dataId),
  }
}