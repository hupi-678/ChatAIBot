import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
})

md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx]
  const lang = token.info.trim()
  const code = token.content

  let highlighted: string
  if (lang && hljs.getLanguage(lang)) {
    try {
      highlighted = hljs.highlight(code, { language: lang }).value
    } catch {
      highlighted = md.utils.escapeHtml(code)
    }
  } else {
    highlighted = md.utils.escapeHtml(code)
  }

  const langLabel = lang
    ? `<span class="code-lang">${md.utils.escapeHtml(lang)}</span>`
    : ''

  return (
    `<div class="code-block-wrapper">`
    + `<div class="code-block-header">${langLabel}<button class="copy-code-btn" title="复制代码">复制</button></div>`
    + `<pre><code class="hljs">${highlighted}</code></pre>`
    + `</div>\n`
  )
}

// Private Use Area sentinel — safe through markdown-it/highlight.js because
// they never touch these codepoints, and the chance of it appearing in real
// content is effectively zero.
const CURSOR_MARKER = '\uE0F0STREAMCURSOR\uE0F1'
const CURSOR_REGEX = new RegExp(CURSOR_MARKER, 'g')
const CURSOR_HTML = '<span class="stream-cursor" aria-hidden="true"></span>'

export function renderMarkdown(content: string, streaming = false): string {
  // For streaming, append a unique marker at the end of the raw content so
  // markdown-it naturally places it inside whatever element contains the last
  // character (paragraph, list item, quote, heading, etc.). We then swap the
  // marker with the cursor span, giving an inline cursor right after the
  // last visible character instead of dangling on a new line below.
  const input = streaming ? content + CURSOR_MARKER : content
  let html = md.render(input)
  if (streaming) {
    if (html.includes(CURSOR_MARKER)) {
      html = html.replace(CURSOR_REGEX, CURSOR_HTML)
    } else {
      html += CURSOR_HTML
    }
  }
  return html
}
