const MAX_ATTRIBUTE_TEXT_LENGTH = 8192
const MAX_ATTRIBUTES_PER_ELEMENT = 50

function parseAttributes(rawAttributes = '') {
  const attrs = {}
  const seen = new Set()
  const attributeText = String(rawAttributes || '').slice(0, MAX_ATTRIBUTE_TEXT_LENGTH)
  const attrPattern = /([a-z0-9:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/gi
  for (const match of attributeText.matchAll(attrPattern)) {
    const key = match[1].toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    attrs[key] = match[2] ?? match[3] ?? match[4] ?? ''
    if (seen.size >= MAX_ATTRIBUTES_PER_ELEMENT) break
  }
  return attrs
}

function stripTags(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function hasAccessibleText(innerHtml, attrs) {
  if (stripTags(innerHtml)) return true
  if (String(attrs['aria-label'] || attrs.title || '').trim()) return true
  return /<img\b[^>]*\balt\s*=\s*["'][^"']+["'][^>]*>/i.test(innerHtml)
}

function lintHtml(html) {
  const value = String(html || '')
  const failures = []

  for (const match of value.matchAll(/<img\b([^>]*)>/gi)) {
    const attrs = parseAttributes(match[1])
    if (!String(attrs.alt || '').trim()) {
      failures.push({ ruleId: 'image-alt', message: 'Image is missing alt text.' })
    }
  }

  let previousHeadingLevel = 0
  for (const match of value.matchAll(/<h([1-6])\b[^>]*>/gi)) {
    const level = Number(match[1])
    if (previousHeadingLevel && level > previousHeadingLevel + 1) {
      failures.push({
        ruleId: 'heading-order',
        message: `Heading level jumps from h${previousHeadingLevel} to h${level}.`,
      })
    }
    previousHeadingLevel = level
  }

  for (const match of value.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = parseAttributes(match[1])
    if (!hasAccessibleText(match[2], attrs)) {
      failures.push({ ruleId: 'link-name', message: 'Link is missing accessible text.' })
    }
  }

  const labelTargets = new Set()
  for (const match of value.matchAll(/<label\b([^>]*)>/gi)) {
    const attrs = parseAttributes(match[1])
    if (attrs.for) labelTargets.add(attrs.for)
  }

  for (const match of value.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)) {
    const tag = match[1].toLowerCase()
    const attrs = parseAttributes(match[2])
    const type = String(attrs.type || '').toLowerCase()
    if (tag === 'input' && ['hidden', 'submit', 'button', 'reset'].includes(type)) continue
    const hasLabel =
      String(attrs['aria-label'] || attrs['aria-labelledby'] || attrs.title || '').trim() ||
      (attrs.id && labelTargets.has(attrs.id))
    if (!hasLabel) {
      failures.push({ ruleId: 'label', message: `${tag} field is missing a label.` })
    }
  }

  for (const match of value.matchAll(/style\s*=\s*["']([^"']+)["']/gi)) {
    const style = match[1].toLowerCase()
    const color = style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/)?.[1]?.trim()
    const background = style.match(/(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/)?.[1]?.trim()
    if (color && background && color === background) {
      failures.push({
        ruleId: 'color-contrast',
        message: 'Text color matches the background color.',
      })
    }
  }

  return { failures }
}

module.exports = { lintHtml, parseAttributes }
