/**
 * HtmlCodeEditor — CodeMirror 6 HTML editor with syntax highlighting,
 * bracket matching, line numbers, and autocomplete.
 *
 * Replaces the plain <textarea> path for HTML content. Designed to slot
 * into the `editor` prop of StackedEditorPane (or any flex container
 * that gives it a minHeight).
 *
 * Why CodeMirror 6 over Monaco: ~120KB gz vs ~2MB gz. Sheet Lab already
 * loads TipTap; CodeMirror keeps the bundle budget reasonable.
 *
 * External value changes (e.g. when the mode toggle pipes sanitized HTML
 * in from a different pane) are applied via `view.dispatch()` rather than
 * recreating the editor — recreation would destroy focus and undo history.
 */
import { useEffect, useRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState, Compartment } from '@codemirror/state'
import { html as htmlLang } from '@codemirror/lang-html'
import './htmlCodeEditor.css'

export default function HtmlCodeEditor({ value, onChange, disabled, placeholder }) {
  const hostRef = useRef(null)
  const viewRef = useRef(null)
  const editableCompartment = useRef(new Compartment())
  // Keep onChange in a ref so the CodeMirror updateListener closure doesn't
  // capture a stale handler when the parent re-renders.
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange })

  // Mount the CodeMirror view exactly once. We never recreate it on prop
  // changes — updates happen through transactions below.
  useEffect(() => {
    if (!hostRef.current) return

    const state = EditorState.create({
      doc: value || '',
      extensions: [
        basicSetup,
        htmlLang(),
        EditorView.lineWrapping,
        editableCompartment.current.of(EditorView.editable.of(!disabled)),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return
          const next = update.state.doc.toString()
          onChangeRef.current?.(next)
        }),
      ],
    })

    const view = new EditorView({ state, parent: hostRef.current })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // External value changes: apply via transaction so we don't lose focus
  // or undo history. Skip when the text already matches (avoids loops).
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === (value || '')) return
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value || '' },
    })
  }, [value])

  // Toggle editable state via compartment reconfigure when `disabled` flips.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: editableCompartment.current.reconfigure(EditorView.editable.of(!disabled)),
    })
  }, [disabled])

  return (
    <div
      ref={hostRef}
      className="sh-html-code-editor"
      data-placeholder={placeholder || ''}
      style={{ flex: 1, minHeight: 320, display: 'flex', flexDirection: 'column' }}
    />
  )
}
