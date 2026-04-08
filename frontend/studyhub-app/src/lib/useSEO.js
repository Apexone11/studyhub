/* ═══════════════════════════════════════════════════════════════════════════
 * useSEO.js — Dynamic SEO meta tags via react-helmet-async
 *
 * Sets page title, description, and Open Graph / Twitter Card meta tags
 * for each page. Google's JS renderer picks these up for indexing.
 *
 * Usage:
 *   useSEO({ title: 'My Sheet', description: 'A study guide for CS101' })
 *   useSEO({ title: 'Feed' })  // description defaults to site description
 *
 * For pages that only need a title (backward compat with usePageTitle):
 *   useSEO({ title: 'Settings' })
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect } from 'react'

const SITE_NAME = 'StudyHub'
const DEFAULT_DESCRIPTION =
  'Browse, upload, and collaborate on course study sheets with students at your school.'

/**
 * @param {Object} options
 * @param {string} [options.title] - Page title (appended with " -- StudyHub")
 * @param {string} [options.description] - Meta description for SEO
 * @param {string} [options.image] - OG image URL (absolute)
 * @param {string} [options.url] - Canonical URL override
 * @param {string} [options.type] - OG type (default: 'website')
 */
export function useSEO({ title, description, image, url, type = 'website' } = {}) {
  useEffect(() => {
    // Title
    const fullTitle = title ? `${title} -- ${SITE_NAME}` : SITE_NAME
    document.title = fullTitle

    // Helper to set or create a meta tag
    const setMeta = (attr, key, content) => {
      if (!content) return
      let el = document.querySelector(`meta[${attr}="${key}"]`)
      if (!el) {
        el = document.createElement('meta')
        el.setAttribute(attr, key)
        document.head.appendChild(el)
      }
      el.setAttribute('content', content)
    }

    const desc = description || DEFAULT_DESCRIPTION
    const pageUrl = url || window.location.href

    // Standard meta
    setMeta('name', 'description', desc)

    // Open Graph
    setMeta('property', 'og:title', fullTitle)
    setMeta('property', 'og:description', desc)
    setMeta('property', 'og:type', type)
    setMeta('property', 'og:url', pageUrl)
    if (image) setMeta('property', 'og:image', image)

    // Twitter Card
    setMeta('name', 'twitter:title', fullTitle)
    setMeta('name', 'twitter:description', desc)
    if (image) setMeta('name', 'twitter:image', image)

    return () => {
      document.title = SITE_NAME
    }
  }, [title, description, image, url, type])
}

/**
 * Backward-compatible alias for pages that only set a title.
 * Drop-in replacement for the old usePageTitle hook.
 */
export function usePageTitle(title) {
  useSEO({ title })
}
