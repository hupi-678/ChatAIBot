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

export function renderMarkdown(content: string): string {
  return md.render(content)
}
