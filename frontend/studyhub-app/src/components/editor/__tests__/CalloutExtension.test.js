/**
 * CalloutExtension.test.js — the callout node's HTML contract.
 *
 * The stored markup is what the viewer's sanitizer sees, so the type
 * allowlist that guards it is the thing worth pinning. Exercises the
 * node's own parse/render config directly rather than booting a full
 * editor, which keeps the test free of extra tiptap packages.
 */
import { describe, expect, it } from 'vitest'
import { Callout, CALLOUT_LABELS, CALLOUT_TYPES } from '../CalloutExtension'

// `addAttributes` is declared as a method on the node config, so it needs a
// `this` context when called outside the editor.
const typeAttribute = Callout.config.addAttributes.call({ name: 'callout' }).type

function parseType(attributeValue) {
  const element = { getAttribute: () => attributeValue }
  return typeAttribute.parseHTML(element)
}

function renderedMarkup(dataCalloutValue) {
  return Callout.config.renderHTML.call(
    { name: 'callout' },
    {
      HTMLAttributes: { 'data-callout': dataCalloutValue },
    },
  )
}

describe('CalloutExtension', () => {
  it('exposes a label for every type', () => {
    expect(CALLOUT_TYPES).toEqual(['note', 'tip', 'important', 'warning', 'definition'])
    for (const type of CALLOUT_TYPES) {
      expect(CALLOUT_LABELS[type]).toBeTruthy()
    }
  })

  it('is a block node that only accepts paragraph content', () => {
    expect(Callout.config.group).toBe('block')
    expect(Callout.config.content).toBe('paragraph+')
  })

  it('parses every known type unchanged', () => {
    for (const type of CALLOUT_TYPES) {
      expect(parseType(type)).toBe(type)
    }
  })

  it('coerces unknown, empty, and missing types to note', () => {
    expect(parseType('evil')).toBe('note')
    expect(parseType('<script>')).toBe('note')
    expect(parseType('')).toBe('note')
    expect(parseType(null)).toBe('note')
    expect(parseType(undefined)).toBe('note')
  })

  it('is case-insensitive when parsing a type', () => {
    expect(parseType('WARNING')).toBe('warning')
  })

  it('renders the data attribute from the stored attribute value', () => {
    expect(typeAttribute.renderHTML({ type: 'tip' })).toEqual({ 'data-callout': 'tip' })
    expect(typeAttribute.renderHTML({ type: 'nope' })).toEqual({ 'data-callout': 'note' })
  })

  it('renders a div carrying the type-specific styling class and a content hole', () => {
    for (const type of CALLOUT_TYPES) {
      const [tag, attrs, hole] = renderedMarkup(type)
      expect(tag).toBe('div')
      expect(attrs['data-callout']).toBe(type)
      expect(attrs.class).toBe(`sh-callout sh-callout--${type}`)
      expect(hole).toBe(0)
    }
  })

  it('never emits an unknown type into the rendered class', () => {
    const [, attrs] = renderedMarkup('evil')
    expect(attrs['data-callout']).toBe('note')
    expect(attrs.class).toBe('sh-callout sh-callout--note')
  })

  it('declares the parse rule the viewer sanitizer allowlists', () => {
    expect(Callout.config.parseHTML.call({ name: 'callout' })).toEqual([
      { tag: 'div[data-callout]' },
    ])
  })
})
