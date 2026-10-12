;(function mountGhzWindowBar() {
  /* Generic GHZ controls for frameless Electron application windows. */
  var script = document.currentScript
  var data = (script && script.dataset) || {}
  var targetSelector = data.target || '.menu-footer'
  var accent = data.accent || 'var(--accent, #f97316)'
  var themeKey = data.themeKey || 'ghz-app-theme'
  var skew = parseInt(data.skew, 10)
  if (isNaN(skew)) skew = 11
  var seam = 3
  var replace = data.replace !== 'false'

  var SUN = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path></svg>'
  var MOON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"></path></svg>'

  function controlWindow(action) {
    try {
      if (window.ghzApp && typeof window.ghzApp[action] === 'function') {
        window.ghzApp[action]()
        return
      }
    } catch (error) {}

    try {
      require('electron').ipcRenderer.send('window:' + action)
      return
    } catch (error) {}

    if (action === 'close') {
      try { window.close() } catch (error) {}
    }
  }

  function currentTheme() {
    return document.body.dataset.theme === 'light' ? 'light' : 'dark'
  }

  function injectStyle() {
    if (document.getElementById('ghz-winbar-style')) return

    var start = 'polygon(0 0,100% 0,calc(100% - ' + skew + 'px) 100%,0 100%)'
    var middle = 'polygon(' + skew + 'px 0,100% 0,calc(100% - ' + skew + 'px) 100%,0 100%)'
    var end = 'polygon(' + skew + 'px 0,100% 0,100% 100%,0 100%)'
    var style = document.createElement('style')
    style.id = 'ghz-winbar-style'
    style.textContent =
      '.ghz-winbar{--ghz-accent:' + accent + ';display:flex;width:100%;gap:' + seam + 'px;box-sizing:border-box;margin-bottom:10px;border-radius:10px;overflow:hidden}' +
      '.ghz-winbar__btn{flex:1 1 0;min-width:0;height:32px;border:0;padding:0;cursor:pointer;font-family:inherit;color:rgba(255,255,255,.7);background:#0e1f0e;display:flex;align-items:center;justify-content:center;line-height:1;transition:background .15s,color .15s;-webkit-app-region:no-drag}' +
      '.ghz-winbar__btn{clip-path:' + middle + ';margin-right:-' + skew + 'px}' +
      '.ghz-winbar__btn:first-child{clip-path:' + start + '}' +
      '.ghz-winbar__btn:hover{background:color-mix(in srgb,var(--ghz-accent) 22%,#0e1f0e);color:#fff}' +
      '.ghz-winbar__btn--close{clip-path:' + end + ';margin-right:0;background:#e0443e;color:#fff}' +
      '.ghz-winbar__btn--close:hover{background:#f2564f;color:#fff}' +
      '.ghz-winbar__ico{display:flex;align-items:center;justify-content:center}' +
      '.ghz-winbar__theme .ghz-winbar__ico{color:var(--ghz-accent)}' +
      '.ghz-winbar__glyph{font-size:15px;font-weight:400}' +
      'body[data-theme="light"] .ghz-winbar__btn{background:#e5e7eb;color:#334155}' +
      'body[data-theme="light"] .ghz-winbar__btn:hover{background:color-mix(in srgb,var(--ghz-accent) 20%,#e5e7eb);color:#0f172a}' +
      'body[data-theme="light"] .ghz-winbar__btn--close{background:#e0443e;color:#fff}' +
      (replace ? '.theme-button,.window-controls{display:none !important}' : '')
    document.head.appendChild(style)
  }

  function mount() {
    var target = document.querySelector(targetSelector)
    if (!target) return false
    if (target.querySelector('.ghz-winbar')) return true

    injectStyle()

    var bar = document.createElement('div')
    bar.className = 'ghz-winbar'
    bar.innerHTML =
      '<button type="button" class="ghz-winbar__btn ghz-winbar__theme" data-action="theme" aria-label="Alternar tema" title="Alternar tema"><span class="ghz-winbar__ico"></span></button>' +
      '<button type="button" class="ghz-winbar__btn" data-action="minimize" aria-label="Minimizar" title="Minimizar"><span class="ghz-winbar__glyph">&#8722;</span></button>' +
      '<button type="button" class="ghz-winbar__btn" data-action="maximize" aria-label="Maximizar ou restaurar" title="Maximizar ou restaurar"><span class="ghz-winbar__glyph">&#9633;</span></button>' +
      '<button type="button" class="ghz-winbar__btn ghz-winbar__btn--close" data-action="close" aria-label="Fechar" title="Fechar"><span class="ghz-winbar__glyph">&#10005;</span></button>'

    var icon = bar.querySelector('.ghz-winbar__theme .ghz-winbar__ico')

    function paintTheme(theme) {
      icon.innerHTML = theme === 'dark' ? SUN : MOON
    }

    function applyTheme(theme) {
      var normalized = theme === 'light' ? 'light' : 'dark'
      document.body.dataset.theme = normalized
      try { localStorage.setItem(themeKey, normalized) } catch (error) {}
      paintTheme(normalized)
      document.dispatchEvent(new CustomEvent('ghz:theme-changed', { detail: { theme: normalized } }))
    }

    bar.addEventListener('click', function (event) {
      var button = event.target.closest('[data-action]')
      if (!button) return
      var action = button.dataset.action
      if (action === 'theme') applyTheme(currentTheme() === 'dark' ? 'light' : 'dark')
      else controlWindow(action)
    })

    var initial = 'dark'
    try { initial = localStorage.getItem(themeKey) || currentTheme() } catch (error) { initial = currentTheme() }
    applyTheme(initial)

    target.insertBefore(bar, target.firstChild || null)
    return true
  }

  function boot() {
    if (mount()) return
    try {
      var observer = new MutationObserver(function () {
        if (mount()) observer.disconnect()
      })
      observer.observe(document.documentElement, { childList: true, subtree: true })
    } catch (error) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true })
  else boot()
})()
