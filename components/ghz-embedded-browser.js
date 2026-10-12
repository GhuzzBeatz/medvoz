/**
 * Produces the scrollbar CSS for a secure Electron BrowserView.
 * BrowserView content does not inherit the host application's stylesheet.
 */
function createEmbeddedBrowserScrollbarCss(options = {}) {
  const accent = options.accent || '#198b47'
  const accentHover = options.accentHover || '#25d66c'
  const track = options.track || '#071108'

  return `
    html, body, * {
      scrollbar-width: thin !important;
      scrollbar-color: ${accent} ${track} !important;
    }
    ::-webkit-scrollbar { width: 8px !important; height: 8px !important; }
    ::-webkit-scrollbar-track { background: ${track} !important; border: 0 !important; }
    ::-webkit-scrollbar-thumb {
      min-height: 32px !important;
      border: 2px solid ${track} !important;
      border-radius: 999px !important;
      background: ${accent} !important;
    }
    ::-webkit-scrollbar-thumb:hover { background: ${accentHover} !important; }
    ::-webkit-scrollbar-corner { background: ${track} !important; }
  `
}

module.exports = { createEmbeddedBrowserScrollbarCss }
