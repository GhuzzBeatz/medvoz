;(function mountGhzSupport() {
  const script = document.currentScript
  const targetSelector = script?.dataset.target || '.menu-footer, .sidebar-footer, .sidebar-foot'
  const accent = script?.dataset.accent || '#ff9900'
  const preserve = script?.dataset.preserve === 'true'
  const floating = script?.dataset.floating === 'true'
  const mode = String(script?.dataset.mode || 'whatsapp').toLowerCase()
  const whatsappNumber = String(script?.dataset.whatsapp || '5511948981459').replace(/\D/g, '')
  const whatsappLabel = script?.dataset.whatsappLabel || '(11) 94898-1459'
  const aiHref = script?.dataset.aiHref || 'pages/ajuda_ia.html'
  const aiLabel = script?.dataset.aiLabel || 'Ajuda IA'
  const supportHref = 'https://ghzplugin.com.br/suporte/'
  const rawSiteHref = script?.dataset.siteHref || supportHref
  const siteHref = /^https:\/\/(?:www\.)?ghzplugin\.com\.br\/?$/i.test(rawSiteHref) ? supportHref : rawSiteHref
  const siteLabel = script?.dataset.siteLabel || 'Suporte'

  function openExternal(url) {
    try {
      require('electron').shell.openExternal(url)
    } catch (e) {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  function mount() {
    let target = document.querySelector(targetSelector)
    if (!target && floating) {
      target = document.createElement('div')
      target.className = 'ghz-support-floating'
      document.body.appendChild(target)
    }
    if (!target || target.querySelector('.ghz-support-card')) return

    if (!preserve) {
      target.querySelectorAll([
        '.menu-footer-brand', '.menu-footer-name', '.menu-footer-phone', '.menu-footer-site',
        '.footer-brand', '.footer-info', '.foot-brand', '.ghz-brand', '.version-txt',
        '.sidebar-brand', '.sidebar-brand-bottom', '.sidebar-brand-name',
        '.ghz-footer__support', '.ghz-footer__divider', '.ghz-footer__info'
      ].join(',')).forEach((element) => element.remove())
    }

    const style = document.createElement('style')
    style.textContent = `
      .ghz-support-card{--ghz-accent:${accent};width:100%;max-width:100%;min-width:0;box-sizing:border-box;padding:0;border:0;border-radius:0;background:transparent;box-shadow:none;font-family:Arial,Helvetica,sans-serif;color:#fff;text-align:left;overflow:hidden}
      .ghz-support-floating{position:fixed;right:14px;bottom:14px;width:210px;box-sizing:border-box;padding:10px;background:#111827;z-index:2147483000}
      .ghz-support-links{display:grid;grid-template-columns:1fr 1fr;gap:6px}
      .ghz-support-link{display:flex;align-items:center;justify-content:center;gap:5px;min-width:0;padding:7px 5px;border-radius:8px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);color:#fff;text-decoration:none;cursor:pointer;transition:background .2s,border-color .2s}
      .ghz-support-link:hover{background:color-mix(in srgb,var(--ghz-accent) 8%,transparent);border-color:color-mix(in srgb,var(--ghz-accent) 28%,transparent)}
      .ghz-support-icon{width:22px;height:22px;min-width:22px;border-radius:7px;background:color-mix(in srgb,var(--ghz-accent) 12%,transparent);display:flex;align-items:center;justify-content:center;font-size:12px}
      .ghz-support-copy{min-width:0}
      .ghz-support-copy strong{display:block;color:var(--ghz-accent);font-size:10px;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    `
    document.head.appendChild(style)

    const primary = mode === 'ai'
      ? { href: aiHref, icon: '&#129302;', label: aiLabel, inapp: script?.dataset.aiInapp !== 'false' }
      : { href: `https://wa.me/${whatsappNumber}`, icon: '&#128241;', label: whatsappLabel, inapp: false }

    const card = document.createElement('section')
    card.className = 'ghz-support-card'
    card.innerHTML = `
      <div class="ghz-support-links">
        <a class="ghz-support-link" ${primary.inapp ? 'data-inapp="true"' : ''} href="${primary.href}"><span class="ghz-support-icon">${primary.icon}</span><span class="ghz-support-copy"><strong>${primary.label}</strong></span></a>
        <a class="ghz-support-link" href="${siteHref}"><span class="ghz-support-icon">&#127760;</span><span class="ghz-support-copy"><strong>${siteLabel}</strong></span></a>
      </div>
    `
    card.querySelectorAll('a').forEach((link) => link.addEventListener('click', (event) => {
      event.preventDefault()
      if (link.dataset.inapp === 'true') {
        const href = link.getAttribute('href')
        try { if (typeof window.ir === 'function') { window.ir(href); return } } catch (_) {}
        try { const frame = document.getElementById('frame'); if (frame) { frame.src = href; return } } catch (_) {}
        try { window.location.href = href; return } catch (_) {}
      }
      openExternal(link.href)
    }))
    target.appendChild(card)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true })
  else mount()
})()
