;(function mountMedVozFeatures() {
  /*
   * Workspace features layered on top of app.js:
   * transcript bubbles + search, rich document editor + print/PDF, patient record,
   * agent chat, trash, onboarding checklist. Relies on the globals defined in app.js
   * (store, $, $$, escapeHtml, saveStore, renderAll, switchPage, getContext...).
   */

  const TRASH_DAYS = 30
  const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024
  const MAX_LOGO_BYTES = 600 * 1024
  const onboarding = readJson('medvoz.onboarding', {})

  function readJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || '') || fallback
    } catch (error) {
      return fallback
    }
  }

  function saveOnboarding() {
    localStorage.setItem('medvoz.onboarding', JSON.stringify(onboarding))
  }

  function toast(message, type, options) {
    window.ui.toast(message, type, options)
  }

  function uid() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  }

  function formatBytes(bytes) {
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }

  function formatDateTime(iso) {
    const date = new Date(iso)
    return Number.isNaN(date.getTime()) ? '' : `${date.toLocaleDateString('pt-BR')} ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
  }

  function interceptValue(element, onSet) {
    // Keeps app.js working with plain `.value` while the UI renders a richer view.
    const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')
    Object.defineProperty(element, 'value', {
      configurable: true,
      get() {
        return descriptor.get.call(this)
      },
      set(value) {
        descriptor.set.call(this, value)
        onSet(String(value == null ? '' : value))
      }
    })
    return (value) => descriptor.set.call(element, value)
  }

  // ---------------------------------------------------------------------------
  // Rich text helpers (AI plain text <-> editor HTML)
  // ---------------------------------------------------------------------------

  function inlineFormat(escaped) {
    return escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/__(.+?)__/g, '<strong>$1</strong>')
  }

  function textToHtml(text) {
    const lines = String(text || '').replace(/\r\n/g, '\n').split('\n')
    const out = []
    let list = null
    let first = true
    let signature = false
    const closeList = () => {
      if (list) out.push(`</${list}>`)
      list = null
    }
    lines.forEach((raw) => {
      const line = raw.trim()
      if (!line) {
        closeList()
        return
      }
      // Signature area (rule line + doctor data): plain lines, no automatic bold or headings.
      if (/^_{5,}$/.test(line)) {
        closeList()
        signature = true
        out.push(`<p><br></p><p>${line}</p>`)
        return
      }
      if (signature) {
        out.push(`<p>${escapeHtml(line)}</p>`)
        return
      }
      let match = line.match(/^#{1,6}\s+(.*)$/)
      if (match) {
        closeList()
        out.push(`<h3>${inlineFormat(escapeHtml(match[1]))}</h3>`)
        first = false
        return
      }
      match = line.match(/^[-•*]\s+(.*)$/)
      if (match) {
        if (list !== 'ul') {
          closeList()
          out.push('<ul>')
          list = 'ul'
        }
        out.push(`<li>${inlineFormat(escapeHtml(match[1]))}</li>`)
        first = false
        return
      }
      match = line.match(/^\d+[.)]\s+(.*)$/)
      if (match) {
        if (list !== 'ol') {
          closeList()
          out.push('<ol>')
          list = 'ol'
        }
        out.push(`<li>${inlineFormat(escapeHtml(match[1]))}</li>`)
        first = false
        return
      }
      closeList()
      const html = inlineFormat(escapeHtml(line))
      const label = line.match(/^([^:]{1,40}):\s+(.+)$/)
      if (first && line.length <= 80) out.push(`<h2>${html}</h2>`)
      else if (/^[^:]{1,60}:$/.test(line) || /^[A-ZÀ-Ý0-9 /().-]{4,60}$/.test(line)) out.push(`<p><strong>${html}</strong></p>`)
      else if (label && !/https?$/i.test(label[1])) out.push(`<p><strong>${inlineFormat(escapeHtml(label[1]))}:</strong> ${inlineFormat(escapeHtml(label[2]))}</p>`)
      else out.push(`<p>${html}</p>`)
      first = false
    })
    closeList()
    return out.join('')
  }

  function htmlToText(root) {
    const lines = []
    let current = ''
    const flush = () => {
      lines.push(current)
      current = ''
    }
    const walk = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        current += node.nodeValue.replace(/\s+/g, ' ')
        return
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return
      const tag = node.tagName
      if (tag === 'BR') {
        flush()
        return
      }
      if (tag === 'UL' || tag === 'OL') {
        if (current.trim()) flush()
        let index = 0
        Array.from(node.children).forEach((child) => {
          if (child.tagName !== 'LI') return
          index += 1
          current = tag === 'OL' ? `${index}. ` : '- '
          child.childNodes.forEach(walk)
          flush()
        })
        return
      }
      const block = /^(P|DIV|H[1-6]|LI|BLOCKQUOTE|PRE|SECTION|ARTICLE)$/.test(tag)
      if (block && current.trim()) flush()
      node.childNodes.forEach(walk)
      if (block) flush()
    }
    root.childNodes.forEach(walk)
    if (current) flush()
    return lines.map((line) => line.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim()
  }

  const ALLOWED_TAGS = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'H2', 'H3', 'H4', 'UL', 'OL', 'LI', 'DIV', 'SPAN'])
  const DROPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'IMG', 'SVG', 'VIDEO', 'AUDIO', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT'])

  function sanitizeHtml(html) {
    const template = document.createElement('template')
    template.innerHTML = String(html || '')
    const clean = (parent) => {
      Array.from(parent.childNodes).forEach((node) => {
        if (node.nodeType === Node.COMMENT_NODE) {
          node.remove()
          return
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return
        if (DROPPED_TAGS.has(node.tagName)) {
          node.remove()
          return
        }
        clean(node)
        if (!ALLOWED_TAGS.has(node.tagName)) {
          node.replaceWith(...Array.from(node.childNodes))
          return
        }
        Array.from(node.attributes).forEach((attribute) => node.removeAttribute(attribute.name))
      })
    }
    clean(template.content)
    return template.innerHTML
  }

  // ---------------------------------------------------------------------------
  // 1. Transcript bubbles + search
  // ---------------------------------------------------------------------------

  const transcriptState = { view: 'chat', query: '', current: 0, frame: 0 }
  const INLINE_ROLES = /\b(M[eé]dic[oa]|Doutora?|Paciente|Acompanhante|Enfermeir[oa]|Familiar)\s*:/i

  function roleFor(speaker, palette) {
    if (!speaker) return 'neutral'
    if (/m[eé]dic|doutor|^dra?\.?$|profissional|enfermeir/i.test(speaker)) return 'doctor'
    if (/paciente/i.test(speaker)) return 'patient'
    if (!palette.has(speaker)) palette.set(speaker, ['other-a', 'other-b', 'other-c'][palette.size % 3])
    return palette.get(speaker)
  }

  function parseTranscript(text) {
    const turns = []
    const push = (speaker, content) => {
      const value = String(content || '').trim()
      if (!value) return
      const last = turns[turns.length - 1]
      if (last && last.speaker === speaker) last.text += `\n${value}`
      else turns.push({ speaker, text: value })
    }
    String(text || '').split(/\n+/).forEach((line) => {
      if (!line.trim()) return
      let speaker = null
      let rest = line
      const lead = line.match(/^\s*([A-Za-zÀ-ÿ][\wÀ-ÿ .-]{0,28}):\s+(.*)$/)
      if (lead) {
        speaker = lead[1].trim()
        rest = lead[2]
      }
      const parts = rest.split(new RegExp(INLINE_ROLES.source, 'i'))
      push(speaker, parts[0])
      for (let index = 1; index < parts.length; index += 2) {
        push(parts[index].replace(/^./, (char) => char.toUpperCase()), parts[index + 1])
      }
    })
    return turns
  }

  function highlight(text, query) {
    const escaped = escapeHtml(text)
    if (!query) return escaped.replace(/\n/g, '<br>')
    const pattern = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return escaped.replace(new RegExp(pattern, 'gi'), (match) => `<mark>${match}</mark>`).replace(/\n/g, '<br>')
  }

  function scheduleTranscriptRender() {
    cancelAnimationFrame(transcriptState.frame)
    transcriptState.frame = requestAnimationFrame(renderTranscriptBubbles)
  }

  function renderTranscriptBubbles() {
    const host = $('#transcriptBubbles')
    if (!host) return
    const nearBottom = host.scrollTop + host.clientHeight >= host.scrollHeight - 40
    const turns = parseTranscript($('#transcriptText').value)
    if (!turns.length) {
      host.innerHTML = `<div class="bubbles-empty"><strong>A conversa aparece aqui</strong><span>Grave, importe um audio ou cole uma transcricao. Medico e paciente ficam em cores diferentes quando a IA separa os participantes.</span></div>`
      $('#transcriptSearchCount').textContent = ''
      return
    }
    const palette = new Map()
    host.innerHTML = turns.map((turn) => {
      const role = roleFor(turn.speaker, palette)
      const name = turn.speaker || 'Transcricao'
      return `<div class="bubble bubble-${role}">
        <span class="bubble-avatar" aria-hidden="true">${escapeHtml(name.charAt(0).toUpperCase())}</span>
        <div class="bubble-body"><span class="bubble-name">${escapeHtml(name)}</span><p>${highlight(turn.text, transcriptState.query)}</p></div>
      </div>`
    }).join('')
    const marks = host.querySelectorAll('mark')
    const count = $('#transcriptSearchCount')
    if (transcriptState.query) {
      count.textContent = marks.length ? `${Math.min(transcriptState.current + 1, marks.length)} de ${marks.length}` : 'Nenhum resultado'
      if (marks.length) focusMatch(transcriptState.current, false)
    } else {
      count.textContent = ''
      if (nearBottom) host.scrollTop = host.scrollHeight
    }
  }

  function focusMatch(index, scroll = true) {
    const marks = Array.from($('#transcriptBubbles').querySelectorAll('mark'))
    if (!marks.length) return
    transcriptState.current = (index + marks.length) % marks.length
    marks.forEach((mark, position) => mark.classList.toggle('is-current', position === transcriptState.current))
    $('#transcriptSearchCount').textContent = `${transcriptState.current + 1} de ${marks.length}`
    if (scroll) marks[transcriptState.current].scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  function setTranscriptView(view) {
    transcriptState.view = view
    $$('[data-transcript-view]').forEach((button) => button.classList.toggle('is-active', button.dataset.transcriptView === view))
    $('#transcriptBubbles').hidden = view !== 'chat'
    $('#transcriptText').hidden = view !== 'text'
    if (view === 'chat') renderTranscriptBubbles()
    else $('#transcriptText').focus()
  }

  function setupTranscriptView() {
    const area = $('#transcriptText')
    interceptValue(area, scheduleTranscriptRender)
    area.addEventListener('input', scheduleTranscriptRender)
    $$('[data-transcript-view]').forEach((button) => button.addEventListener('click', () => setTranscriptView(button.dataset.transcriptView)))
    $('#transcriptSearch').addEventListener('input', (event) => {
      transcriptState.query = event.target.value.trim()
      transcriptState.current = 0
      if (transcriptState.view !== 'chat') setTranscriptView('chat')
      else renderTranscriptBubbles()
      if (transcriptState.query) focusMatch(0)
    })
    $('#transcriptSearch').addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return
      event.preventDefault()
      focusMatch(transcriptState.current + (event.shiftKey ? -1 : 1))
    })
    $('#btnCopyTranscript').addEventListener('click', async () => {
      const text = area.value.trim()
      if (!text) return toast('Ainda nao ha transcricao para copiar.', 'warn')
      await navigator.clipboard.writeText(text)
      toast('Transcricao copiada.')
    })
    $('#btnPasteTranscript').addEventListener('click', () => setTimeout(() => toast('Texto colado na transcricao.'), 50))
    setTranscriptView('chat')
  }

  // ---------------------------------------------------------------------------
  // 2. Rich document editor, print and PDF with letterhead
  // ---------------------------------------------------------------------------

  const docState = { rawSet: null, syncing: false }

  function updateEditorEmpty() {
    const editor = $('#docEditor')
    editor.classList.toggle('is-empty', !editor.textContent.trim())
  }

  function syncEditorToTextarea() {
    docState.syncing = true
    docState.rawSet(htmlToText($('#docEditor')))
    docState.syncing = false
    updateEditorEmpty()
  }

  function setDocumentHtml(html) {
    $('#docEditor').innerHTML = sanitizeHtml(html)
    syncEditorToTextarea()
  }

  function getDocumentHtml() {
    const editor = $('#docEditor')
    return editor.textContent.trim() ? sanitizeHtml(editor.innerHTML) : ''
  }

  async function copyDocument() {
    const text = $('#clinicalDocument').value.trim()
    if (!text) return toast('Gere ou escreva um documento antes de copiar.', 'warn')
    const html = getDocumentHtml()
    try {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' })
      })])
      toast('Documento copiado com a formatacao.')
    } catch (error) {
      await navigator.clipboard.writeText(text)
      toast('Documento copiado.')
    }
  }

  function documentTitle() {
    const firstHeading = $('#docEditor').querySelector('h2, h3')
    return (firstHeading?.textContent || 'Documento clinico').trim().slice(0, 60)
  }

  function buildPrintableHtml() {
    const settings = store.settings || {}
    const accent = store.config?.accent || '#16a085'
    const logo = /^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=]+$/i.test(settings.logoDataUrl || '')
      ? `<img class="logo" src="${settings.logoDataUrl}" alt="">`
      : ''
    const doctorLine = [settings.doctorName, settings.doctorCrm, settings.doctorSpecialty].filter(Boolean).map(escapeHtml).join(' &middot; ')
    const patient = $('#patientName').value.trim().replace(/^Paciente sem nome$/i, '')
    // Footer goes in the page margin box so it repeats on every page without covering text.
    const footerCss = String(settings.footerText || '').trim()
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/</g, '\\3C ')
      .replace(/\r?\n/g, '\\A ')
    const pageFooter = footerCss
      ? `@bottom-center { content: "${footerCss}"; white-space: pre-wrap; padding-top: 4mm; border-top: 1px solid #d5dfdc; color: #6b7c78; font: 8.5pt/1.4 "Segoe UI", Arial, sans-serif; text-align: center; }`
      : ''
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(documentTitle())}</title><style>
      @page { size: A4; margin: 16mm 16mm 24mm; ${pageFooter} }
      * { box-sizing: border-box; }
      body { margin: 0; color: #1d2b28; font: 11.5pt/1.55 "Segoe UI", Arial, sans-serif; }
      .letterhead { display: flex; align-items: center; gap: 14px; padding-bottom: 12px; border-bottom: 2.5px solid ${accent}; }
      .logo { max-width: 120px; max-height: 64px; object-fit: contain; }
      .clinic { font-size: 16pt; font-weight: 800; color: ${accent}; letter-spacing: -.01em; }
      .doctor { margin-top: 2px; color: #4a5b57; font-size: 10pt; }
      .meta { display: flex; justify-content: space-between; margin: 12px 0 18px; color: #4a5b57; font-size: 10pt; }
      .content h2 { margin: 0 0 12px; font-size: 14pt; }
      .content h3 { margin: 16px 0 6px; font-size: 12pt; color: ${accent}; }
      .content p { margin: 0 0 7px; }
      .content ul, .content ol { margin: 0 0 9px; padding-left: 22px; }
    </style></head><body>
      <header class="letterhead">${logo}<div>${settings.clinicName ? `<div class="clinic">${escapeHtml(settings.clinicName)}</div>` : ''}${doctorLine ? `<div class="doctor">${doctorLine}</div>` : ''}</div></header>
      <div class="meta"><span>${patient ? `Paciente: <strong>${escapeHtml(patient)}</strong>` : ''}</span><span>${new Date().toLocaleDateString('pt-BR')}</span></div>
      <main class="content">${getDocumentHtml()}</main>
    </body></html>`
  }

  async function exportDocumentPdf() {
    if (!getDocumentHtml()) return toast('Gere ou escreva um documento antes de salvar o PDF.', 'warn')
    if (!window.medvozApi?.exportPdf) return toast('Exportacao de PDF disponivel apenas no aplicativo instalado.', 'warn')
    const patient = $('#patientName').value.trim()
    const result = await window.medvozApi.exportPdf({
      html: buildPrintableHtml(),
      fileName: [documentTitle(), patient, new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')].filter(Boolean).join(' - ')
    })
    if (result?.ok) {
      onboarding.pdfExported = true
      saveOnboarding()
      renderOnboarding()
      toast('PDF salvo e aberto.')
    } else if (!result?.canceled) {
      toast(result?.message || 'Nao foi possivel gerar o PDF.', 'error')
    }
  }

  async function printDocument() {
    if (!getDocumentHtml()) return toast('Gere ou escreva um documento antes de imprimir.', 'warn')
    if (!window.medvozApi?.printDocument) return toast('Impressao disponivel apenas no aplicativo instalado.', 'warn')
    const result = await window.medvozApi.printDocument({ html: buildPrintableHtml() })
    if (result?.ok) toast('Documento enviado para a impressora.')
    else if (!result?.canceled) toast(result?.message || 'Nao foi possivel imprimir.', 'error')
  }

  function setupDocumentEditor() {
    const editor = $('#docEditor')
    docState.rawSet = interceptValue($('#clinicalDocument'), (value) => {
      if (docState.syncing) return
      editor.innerHTML = textToHtml(value)
      updateEditorEmpty()
    })
    editor.addEventListener('input', syncEditorToTextarea)
    editor.addEventListener('paste', (event) => {
      event.preventDefault()
      document.execCommand('insertText', false, event.clipboardData.getData('text/plain'))
    })
    editor.addEventListener('drop', (event) => event.preventDefault())
    const toolbar = $('.doc-toolbar')
    toolbar.addEventListener('mousedown', (event) => {
      if (event.target.closest('button')) event.preventDefault()
    })
    toolbar.addEventListener('click', (event) => {
      const button = event.target.closest('button')
      if (!button) return
      editor.focus()
      if (button.dataset.cmd) document.execCommand(button.dataset.cmd, false, null)
      if (button.dataset.block) document.execCommand('formatBlock', false, button.dataset.block)
      syncEditorToTextarea()
    })
    $('#btnPdfDoc').addEventListener('click', () => exportDocumentPdf().catch((error) => toast(error.message, 'error')))
    $('#btnPrintDoc').addEventListener('click', () => printDocument().catch((error) => toast(error.message, 'error')))
    updateEditorEmpty()
  }

  function renderLogoPreview() {
    const preview = $('#logoPreview')
    const logo = store.settings?.logoDataUrl
    preview.innerHTML = logo ? `<img src="${escapeHtml(logo)}" alt="Logo da clinica">` : 'Sem logo'
    $('#btnRemoveLogo').disabled = !logo
  }

  function setupLogoField() {
    $('#btnPickLogo').addEventListener('click', () => $('#logoFile').click())
    $('#logoFile').addEventListener('change', (event) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (!file) return
      if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return toast('Use uma imagem PNG, JPG ou WEBP.', 'warn')
      if (file.size > MAX_LOGO_BYTES) return toast('Logo grande demais. Use uma imagem de ate 600 KB.', 'warn')
      const reader = new FileReader()
      reader.onload = () => {
        store.settings = { ...store.settings, logoDataUrl: String(reader.result) }
        saveStore()
        renderLogoPreview()
        toast('Logo salvo. Ele aparece no PDF e na impressao.')
      }
      reader.readAsDataURL(file)
    })
    $('#btnRemoveLogo').addEventListener('click', () => {
      const { logoDataUrl, ...rest } = store.settings || {}
      store.settings = rest
      saveStore()
      renderLogoPreview()
      toast('Logo removido.')
    })
    renderLogoPreview()
  }

  // ---------------------------------------------------------------------------
  // 6. Trash
  // ---------------------------------------------------------------------------

  function visitTitle(visit) {
    const patient = store.patients.find((item) => item.id === visit.patientId)
    return patient?.name || visit.context?.patientName || 'Paciente'
  }

  function trashVisit(visitId) {
    const index = store.visits.findIndex((visit) => visit.id === visitId)
    if (index < 0) return
    const [visit] = store.visits.splice(index, 1)
    const entry = { id: uid(), kind: 'visit', item: visit, deletedAt: new Date().toISOString() }
    store.trash.unshift(entry)
    saveStore()
    renderAll()
    toast('Atendimento movido para a lixeira.', 'ok', { action: { label: 'Desfazer', onClick: () => restoreTrash(entry.id) } })
  }

  async function trashPatient(patientId) {
    const patient = store.patients.find((item) => item.id === patientId)
    if (!patient) return
    const visits = store.visits.filter((visit) => visit.patientId === patientId)
    const confirmed = await window.ui.confirm({
      title: 'Mover paciente para a lixeira?',
      message: `${patient.name} e ${visits.length} atendimento(s) vao para a lixeira. Voce pode restaurar em ate ${TRASH_DAYS} dias.`,
      confirmLabel: 'Mover para a lixeira',
      danger: true
    })
    if (!confirmed) return
    store.patients = store.patients.filter((item) => item.id !== patientId)
    store.visits = store.visits.filter((visit) => visit.patientId !== patientId)
    const entry = { id: uid(), kind: 'patient', item: patient, visits, deletedAt: new Date().toISOString() }
    store.trash.unshift(entry)
    if (store.selectedPatientId === patientId) store.selectedPatientId = null
    saveStore()
    renderAll()
    toast(`${patient.name} foi para a lixeira.`, 'ok', { action: { label: 'Desfazer', onClick: () => restoreTrash(entry.id) } })
  }

  function restoreTrash(entryId) {
    const entry = store.trash.find((item) => item.id === entryId)
    if (!entry) return
    if (entry.kind === 'visit') {
      store.visits.push(entry.item)
    } else {
      if (!store.patients.some((patient) => patient.id === entry.item.id)) store.patients.unshift(entry.item)
      store.visits.push(...(entry.visits || []).filter((visit) => !store.visits.some((item) => item.id === visit.id)))
    }
    store.visits.sort((a, b) => b.id - a.id)
    store.trash = store.trash.filter((item) => item.id !== entryId)
    saveStore()
    renderAll()
    toast(entry.kind === 'visit' ? 'Atendimento restaurado.' : `${entry.item.name} restaurado(a).`)
  }

  function dropTrashEntries(entries) {
    entries.forEach((entry) => {
      if (entry.kind === 'patient') window.attachmentsDb.removeByPatient(entry.item.id).catch(() => {})
    })
    const ids = new Set(entries.map((entry) => entry.id))
    store.trash = store.trash.filter((item) => !ids.has(item.id))
  }

  async function deleteTrashForever(entryId) {
    const entry = store.trash.find((item) => item.id === entryId)
    if (!entry) return
    const confirmed = await window.ui.confirm({
      title: 'Excluir definitivamente?',
      message: 'Esta acao nao pode ser desfeita. Os dados e arquivos anexados serao apagados deste computador.',
      confirmLabel: 'Excluir para sempre',
      danger: true
    })
    if (!confirmed) return
    dropTrashEntries([entry])
    saveStore()
    renderAll()
    toast('Item excluido definitivamente.')
  }

  async function emptyTrash() {
    if (!store.trash.length) return toast('A lixeira ja esta vazia.', 'info')
    const confirmed = await window.ui.confirm({
      title: 'Esvaziar a lixeira?',
      message: `${store.trash.length} item(ns) serao apagados para sempre. Esta acao nao pode ser desfeita.`,
      confirmLabel: 'Esvaziar',
      danger: true
    })
    if (!confirmed) return
    dropTrashEntries([...store.trash])
    saveStore()
    renderAll()
    toast('Lixeira esvaziada.')
  }

  function purgeOldTrash() {
    const limit = Date.now() - TRASH_DAYS * 86400000
    const expired = store.trash.filter((entry) => new Date(entry.deletedAt).getTime() < limit)
    if (!expired.length) return
    dropTrashEntries(expired)
    saveStore()
  }

  function renderTrash() {
    const count = $('#trashCount')
    count.hidden = !store.trash.length
    count.textContent = store.trash.length
    $('#btnEmptyTrash').disabled = !store.trash.length
    $('#trashList').innerHTML = store.trash.map((entry) => {
      const daysLeft = Math.max(0, TRASH_DAYS - Math.floor((Date.now() - new Date(entry.deletedAt).getTime()) / 86400000))
      const isPatient = entry.kind === 'patient'
      const title = isPatient ? entry.item.name : `${visitTitle(entry.item)} - ${entry.item.date}`
      const detail = isPatient
        ? `Paciente com ${(entry.visits || []).length} atendimento(s)`
        : `Atendimento - ${entry.item.context?.visitType || ''} - ${entry.item.context?.reason || ''}`
      return `<div class="list-item trash-item">
        <div>
          <span class="trash-kind trash-${entry.kind}">${isPatient ? 'Paciente' : 'Atendimento'}</span>
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(detail)}</p>
          <p class="trash-meta">Excluido em ${formatDateTime(entry.deletedAt)} &middot; some em ${daysLeft} dia(s)</p>
        </div>
        <div class="button-row">
          <button class="secondary-button compact" data-restore="${entry.id}">Restaurar</button>
          <button class="secondary-button compact danger-text" data-forever="${entry.id}">Excluir</button>
        </div>
      </div>`
    }).join('') || `<div class="empty-state"><strong>Lixeira vazia</strong><span>Atendimentos e pacientes excluidos aparecem aqui e podem ser restaurados por ${TRASH_DAYS} dias.</span></div>`
  }

  // ---------------------------------------------------------------------------
  // 3. Patient record
  // ---------------------------------------------------------------------------

  const recordState = { tab: 'timeline', editing: false, measureType: 'pa', summaryBusy: false, patientId: null }
  const MEASURES = {
    pa: { label: 'Pressao arterial', unit: 'mmHg', placeholder: '120/80', dual: true },
    peso: { label: 'Peso', unit: 'kg', placeholder: '72,5' },
    glicemia: { label: 'Glicemia', unit: 'mg/dL', placeholder: '98' },
    fc: { label: 'Frequencia cardiaca', unit: 'bpm', placeholder: '72' },
    temp: { label: 'Temperatura', unit: '°C', placeholder: '36,5' },
    imc: { label: 'IMC', unit: 'kg/m²', placeholder: '24,1' }
  }
  const SUMMARY_TEMPLATE = [
    'Resumo do caso (3 a 5 linhas):',
    'Problemas ativos:',
    'Medicacoes em uso:',
    'Alergias:',
    'Exames e pendencias:',
    'O que checar neste retorno:',
    'Proximos passos sugeridos:',
    '',
    'Use somente o que esta no historico. Escreva "nao informado" quando faltar dado. Nao invente doses.'
  ].join('\n')

  function selectedPatient() {
    return store.patients.find((patient) => patient.id === store.selectedPatientId) || null
  }

  function documentLabel(value) {
    if (String(value || '').startsWith('custom:')) {
      return store.customTemplates.find((template) => `custom:${template.id}` === value)?.name || 'Modelo proprio'
    }
    return baseTemplateTitle(value || 'soap')
  }

  function chip(label, value) {
    return `<span class="record-chip"><small>${label}</small>${escapeHtml(value || 'nao informado')}</span>`
  }

  function renderPatientRecord(patient) {
    const host = $('#patientDetail')
    if (!patient) {
      $('#patientDetailTitle').textContent = 'Selecione um paciente'
      host.innerHTML = '<div class="empty-state"><strong>Nenhum paciente selecionado</strong><span>Escolha um paciente na lista para ver a linha do tempo, o resumo, as medidas e os arquivos.</span></div>'
      return
    }
    if (recordState.patientId !== patient.id) {
      recordState.patientId = patient.id
      recordState.editing = false
    }
    const visits = store.visits.filter((visit) => visit.patientId === patient.id)
    $('#patientDetailTitle').textContent = patient.name
    const tabs = [
      ['timeline', `Linha do tempo (${visits.length})`],
      ['summary', 'Resumo'],
      ['measures', `Medidas (${(patient.measures || []).length})`],
      ['files', 'Arquivos']
    ]
    host.innerHTML = `
      <div class="record-head">
        <div class="record-chips">
          ${chip('Nascimento', patient.birthDate ? `${formatBirthDate(patient.birthDate)} (${ageFromBirth(patient.birthDate)} anos)` : (patient.age ? `${patient.age} anos` : ''))}
          ${chip('CPF / documento', patient.document)}
          ${chip('Telefone', patient.phone)}
          ${chip('Especialidade', patient.specialty || visits[0]?.context?.specialty || '')}
        </div>
        <div class="button-row">
          <button class="primary-button compact" data-action="new-visit">Novo atendimento</button>
          <button class="secondary-button compact" data-action="edit">${recordState.editing ? 'Fechar edicao' : 'Editar dados'}</button>
          <button class="secondary-button compact danger-text" data-action="delete-patient" title="Mover paciente para a lixeira">${TRASH_ICON}</button>
        </div>
      </div>
      ${recordState.editing ? patientEditForm(patient) : ''}
      <div class="record-clinical">
        <div><small>Alergias</small><p class="${patient.allergies ? 'is-alert' : ''}">${escapeHtml(patient.allergies || 'nao informado')}</p></div>
        <div><small>Medicacoes em uso</small><p>${escapeHtml(patient.medications || 'nao informado')}</p></div>
        <div><small>Condicoes e antecedentes</small><p>${escapeHtml(patient.conditions || 'nao informado')}</p></div>
      </div>
      <div class="segmented record-tabs" role="tablist">
        ${tabs.map(([key, label]) => `<button type="button" role="tab" data-record-tab="${key}" class="${recordState.tab === key ? 'is-active' : ''}">${label}</button>`).join('')}
      </div>
      <div class="record-panel" id="recordPanel"></div>`
    renderRecordPanel(patient, visits)
  }

  function patientEditForm(patient) {
    const field = (key, label, value, type = 'input') => type === 'textarea'
      ? `<label>${label}<textarea data-field="${key}" rows="2">${escapeHtml(value)}</textarea></label>`
      : `<label>${label}<input data-field="${key}" ${type === 'date' ? 'type="date"' : ''} value="${escapeHtml(value)}"></label>`
    return `<div class="record-edit">
      <div class="form-grid">
        ${field('name', 'Nome', patient.name)}
        ${field('birthDate', 'Data de nascimento', patient.birthDate, 'date')}
        ${field('document', 'CPF ou documento', patient.document)}
        ${field('phone', 'Telefone', patient.phone)}
      </div>
      ${field('allergies', 'Alergias', patient.allergies, 'textarea')}
      ${field('medications', 'Medicacoes em uso', patient.medications, 'textarea')}
      ${field('conditions', 'Condicoes e antecedentes', patient.conditions, 'textarea')}
      <div class="button-row record-edit-actions"><button class="primary-button compact" data-action="save-patient">Salvar dados</button></div>
    </div>`
  }

  function renderRecordPanel(patient, visits) {
    const panel = $('#recordPanel')
    if (recordState.tab === 'timeline') panel.innerHTML = timelineHtml(visits)
    if (recordState.tab === 'summary') panel.innerHTML = summaryHtml(patient, visits)
    if (recordState.tab === 'measures') panel.innerHTML = measuresHtml(patient)
    if (recordState.tab === 'files') {
      panel.innerHTML = `<div class="files-head"><span>Exames, laudos e imagens ficam salvos neste computador.</span><button class="secondary-button compact" data-action="attach">Anexar arquivo</button><input type="file" id="attachmentInput" hidden></div><div class="list-stack" id="attachmentList"><p class="muted-line">Carregando arquivos...</p></div>`
      renderAttachments(patient.id)
    }
  }

  function timelineHtml(visits) {
    if (!visits.length) return '<div class="empty-state"><strong>Sem atendimentos</strong><span>Use "Novo atendimento" para registrar a primeira consulta.</span></div>'
    return `<ol class="timeline">${visits.map((visit) => {
      const documents = visitDocuments(visit)
      const transcript = String(visit.transcript || '').trim()
      return `
      <li class="timeline-item">
        <span class="timeline-dot" aria-hidden="true"></span>
        <div class="timeline-card">
          <div class="timeline-top">
            <strong>${escapeHtml(visit.date)}</strong>
            <span class="timeline-tag">${escapeHtml(visit.context?.visitType || '')}</span>
            <span class="timeline-tag">${documents.length} documento(s)</span>
          </div>
          <p class="timeline-reason">${escapeHtml(visit.context?.specialty || '')} &middot; ${escapeHtml(visit.context?.reason || 'sem motivo informado')}</p>
          ${documents.length ? `<div class="timeline-docs">${documents.map((doc) => `
            <button type="button" class="timeline-doc" data-open-doc="${visit.id}:${doc.id}" title="Abrir este documento no atendimento">
              <span>${escapeHtml(documentLabel(doc.type))}</span>${doc.title && doc.title.toLowerCase() !== documentLabel(doc.type).toLowerCase() ? `<b>${escapeHtml(doc.title)}</b>` : '<b>Abrir documento</b>'}
            </button>`).join('')}</div>` : ''}
          ${transcript ? `<details class="timeline-transcript"><summary>Ver transcricao (${transcript.split(/\s+/).length} palavras)</summary><div>${escapeHtml(transcript).replace(/\n/g, '<br>')}</div></details>` : '<p class="timeline-snippet">Atendimento sem transcricao salva.</p>'}
          <div class="button-row">
            <button class="primary-button compact" data-open-visit="${visit.id}">Abrir atendimento</button>
            <button class="secondary-button compact danger-text" data-trash-visit="${visit.id}">Excluir</button>
          </div>
        </div>
      </li>`
    }).join('')}</ol>`
  }

  function summaryHtml(patient, visits) {
    const summary = patient.summary
    return `<div class="summary-box">
      <div class="files-head">
        <span>${summary ? `Gerado em ${formatDateTime(summary.at)}` : 'A IA le os atendimentos anteriores e prepara o que checar no retorno.'}</span>
        <button class="primary-button compact" data-action="summary" ${!visits.length || recordState.summaryBusy ? 'disabled' : ''}>${recordState.summaryBusy ? 'Gerando...' : summary ? 'Atualizar resumo' : 'Gerar resumo para o retorno'}</button>
      </div>
      ${summary ? `<div class="rich-text">${textToHtml(summary.text)}</div>` : `<div class="empty-state"><strong>${visits.length ? 'Nenhum resumo ainda' : 'Sem historico'}</strong><span>${visits.length ? 'Gere antes do retorno para revisar o caso em segundos.' : 'Salve pelo menos um atendimento para gerar o resumo.'}</span></div>`}
    </div>`
  }

  async function generatePatientSummary(patient) {
    const visits = store.visits.filter((visit) => visit.patientId === patient.id).slice(0, 8)
    if (!visits.length || recordState.summaryBusy) return
    if (typeof ensureOpenAiConfigured === 'function' && !(await ensureOpenAiConfigured())) return toast('Servidor de IA nao configurado.', 'error')
    recordState.summaryBusy = true
    renderPatientRecord(patient)
    try {
      const measures = (patient.measures || []).slice(-6).map((item) => `${MEASURES[item.type]?.label || item.type}: ${item.value} ${MEASURES[item.type]?.unit || ''} (${item.date})`).join('; ')
      const clinical = [
        `Alergias: ${patient.allergies || 'nao informado'}`,
        `Medicacoes em uso: ${patient.medications || 'nao informado'}`,
        `Condicoes: ${patient.conditions || 'nao informado'}`,
        measures ? `Medidas recentes: ${measures}` : ''
      ].filter(Boolean).join('\n')
      const history = visits.map((visit) => [
        `Atendimento ${visit.date} - ${visit.context?.visitType || ''} - ${visit.context?.specialty || ''}`,
        `Motivo: ${visit.context?.reason || ''}`,
        visit.document ? `Documento:\n${visit.document.slice(0, 2500)}` : `Transcricao:\n${(visit.transcript || '').slice(0, 2500)}`
      ].join('\n')).join('\n\n')
      const last = visits[0]
      const result = await window.medvozApi.generateClinicalDocument({
        transcript: `${clinical}\n\nHistorico de atendimentos:\n${history}`,
        context: { ...last.context, reason: `Resumo para retorno: ${last.context?.reason || ''}`.slice(0, 200) },
        patient: { name: patient.unnamed ? '' : patient.name, birthDate: patient.birthDate || '', age: ageFromBirth(patient.birthDate) || patient.age || '', document: patient.document, phone: patient.phone, allergies: patient.allergies || '', medications: patient.medications || '', conditions: patient.conditions || '' },
        documentType: 'evolucao',
        template: { name: 'Resumo para o retorno', body: SUMMARY_TEMPLATE },
        tone: $('#tone').value,
        detailLevel: $('#detailLevel').value
      })
      if (!result?.ok) {
        toast(result?.message || 'Nao foi possivel gerar o resumo.', 'error')
        return
      }
      patient.summary = { text: result.document, at: new Date().toISOString() }
      saveStore()
      toast('Resumo para o retorno pronto.')
    } catch (error) {
      toast(error.message || 'Nao foi possivel gerar o resumo.', 'error')
    } finally {
      recordState.summaryBusy = false
      if (store.selectedPatientId === patient.id) renderPatientRecord(patient)
    }
  }

  function parseMeasure(type, raw) {
    const text = String(raw || '').trim().replace(',', '.')
    if (MEASURES[type].dual) {
      const match = text.match(/^(\d{2,3})\s*[/xX]\s*(\d{2,3})$/)
      return match ? { value: `${match[1]}/${match[2]}`, values: [Number(match[1]), Number(match[2])] } : null
    }
    const number = Number(text)
    return Number.isFinite(number) && number > 0 ? { value: String(number).replace('.', ','), values: [number] } : null
  }

  function measureChart(entries, definition) {
    if (entries.length < 2) return '<div class="chart-empty">Registre pelo menos duas medidas para ver o grafico.</div>'
    const width = 600
    const height = 190
    const pad = { top: 16, right: 18, bottom: 28, left: 42 }
    const all = entries.flatMap((entry) => entry.values)
    let min = Math.min(...all)
    let max = Math.max(...all)
    if (min === max) {
      min -= 1
      max += 1
    }
    const span = max - min
    min -= span * 0.12
    max += span * 0.12
    const x = (index) => pad.left + (index * (width - pad.left - pad.right)) / (entries.length - 1)
    const y = (value) => pad.top + (1 - (value - min) / (max - min)) * (height - pad.top - pad.bottom)
    const series = definition.dual ? [0, 1] : [0]
    const colors = ['var(--accent)', '#3b82f6']
    const lines = series.map((serie) => {
      const points = entries.map((entry, index) => `${x(index).toFixed(1)},${y(entry.values[serie]).toFixed(1)}`).join(' ')
      const dots = entries.map((entry, index) => `<circle cx="${x(index).toFixed(1)}" cy="${y(entry.values[serie]).toFixed(1)}" r="4" fill="${colors[serie]}"><title>${escapeHtml(entry.date)}: ${escapeHtml(entry.value)} ${definition.unit}</title></circle>`).join('')
      return `<polyline points="${points}" fill="none" stroke="${colors[serie]}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>${dots}`
    }).join('')
    const grid = [0, 0.5, 1].map((step) => {
      const value = min + (max - min) * (1 - step)
      const lineY = pad.top + step * (height - pad.top - pad.bottom)
      return `<line x1="${pad.left}" x2="${width - pad.right}" y1="${lineY}" y2="${lineY}" class="chart-grid"/><text x="${pad.left - 8}" y="${lineY + 4}" text-anchor="end" class="chart-label">${Math.round(value)}</text>`
    }).join('')
    const formatShort = (value) => value.split('-').reverse().slice(0, 2).join('/')
    const legend = definition.dual ? '<div class="chart-legend"><span><i style="background:var(--accent)"></i>Sistolica</span><span><i style="background:#3b82f6"></i>Diastolica</span></div>' : ''
    return `<svg class="measure-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Grafico de ${definition.label}">
      ${grid}${lines}
      <text x="${pad.left}" y="${height - 6}" class="chart-label">${formatShort(entries[0].date)}</text>
      <text x="${width - pad.right}" y="${height - 6}" text-anchor="end" class="chart-label">${formatShort(entries[entries.length - 1].date)}</text>
    </svg>${legend}`
  }

  function measuresHtml(patient) {
    const all = patient.measures || []
    const type = recordState.measureType
    const definition = MEASURES[type]
    const entries = all.filter((item) => item.type === type).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    const todayIso = new Date().toISOString().slice(0, 10)
    return `<div class="measures">
      <div class="measure-form">
        <label>Medida<select data-measure="type">${Object.entries(MEASURES).map(([key, item]) => `<option value="${key}" ${key === type ? 'selected' : ''}>${item.label}</option>`).join('')}</select></label>
        <label>Valor (${definition.unit})<input data-measure="value" placeholder="${definition.placeholder}"></label>
        <label>Data<input data-measure="date" type="date" value="${todayIso}" max="${todayIso}"></label>
        <button class="primary-button compact" data-action="add-measure">Adicionar</button>
      </div>
      <div class="chart-card"><strong>${definition.label}</strong>${measureChart(entries, definition)}</div>
      <div class="measure-list">${entries.slice().reverse().map((entry) => `
        <span class="measure-pill">${escapeHtml(entry.date.split('-').reverse().join('/'))} &middot; <b>${escapeHtml(entry.value)}</b> ${definition.unit}
          <button type="button" data-remove-measure="${entry.id}" aria-label="Remover medida">&#10005;</button></span>`).join('') || '<p class="muted-line">Nenhuma medida registrada para este tipo.</p>'}
      </div>
    </div>`
  }

  async function renderAttachments(patientId) {
    const list = $('#attachmentList')
    let items = []
    try {
      items = await window.attachmentsDb.listByPatient(patientId)
    } catch (error) {
      if (list) list.innerHTML = '<p class="muted-line">Nao foi possivel ler os arquivos deste paciente.</p>'
      return
    }
    if (!list || recordState.tab !== 'files' || store.selectedPatientId !== patientId) return
    items.sort((a, b) => b.addedAt.localeCompare(a.addedAt))
    list.innerHTML = items.map((item) => `
      <div class="list-item file-item">
        <div><h3>${escapeHtml(item.name)}</h3><p>${formatBytes(item.size)} &middot; ${formatDateTime(item.addedAt)}</p></div>
        <div class="button-row">
          <button class="secondary-button compact" data-download-file="${escapeHtml(item.id)}">Baixar</button>
          <button class="secondary-button compact danger-text" data-remove-file="${escapeHtml(item.id)}">Excluir</button>
        </div>
      </div>`).join('') || '<div class="empty-state"><strong>Nenhum arquivo</strong><span>Anexe exames, laudos, imagens ou documentos do paciente (ate 20 MB cada).</span></div>'
  }

  async function attachFile(patient, file) {
    if (!file) return
    if (file.size > MAX_ATTACHMENT_BYTES) return toast('Arquivo grande demais. O limite e 20 MB.', 'warn')
    await window.attachmentsDb.add({ id: `${patient.id}-${uid()}`, patientId: patient.id, name: file.name, type: file.type, size: file.size, addedAt: new Date().toISOString(), blob: file })
    toast(`${file.name} anexado.`)
    renderAttachments(patient.id)
  }

  async function downloadAttachment(id) {
    const item = await window.attachmentsDb.get(id)
    if (!item) return
    const url = URL.createObjectURL(item.blob)
    const link = document.createElement('a')
    link.href = url
    link.download = item.name
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
  }

  function startVisitForPatient(patient) {
    if (store.recorder && store.recorder.state !== 'inactive') {
      toast('Encerre a gravacao atual antes de iniciar outro atendimento.', 'warn')
      return
    }
    startNewVisit()
    $('#patientName').value = patient.unnamed ? '' : (patient.name || '')
    $('#patientBirth').value = patient.birthDate || ''
    $('#patientDoc').value = patient.document || ''
    $('#patientPhone').value = patient.phone || ''
    $('#visitReason').value = ''
    $('#recordConsent').checked = false
    $('#transcriptText').value = ''
    $('#clinicalDocument').value = ''
    switchPage('atendimento')
    $('#visitReason').focus()
    toast(`Novo atendimento para ${patient.name}.`, 'info')
  }

  function setupPatientRecord() {
    const host = $('#patientDetail')
    host.addEventListener('click', async (event) => {
      const patient = selectedPatient()
      if (!patient) return
      const tab = event.target.closest('[data-record-tab]')
      if (tab) {
        recordState.tab = tab.dataset.recordTab
        renderPatientRecord(patient)
        return
      }
      const openDoc = event.target.closest('[data-open-doc]')
      if (openDoc) {
        const [visitId, docId] = openDoc.dataset.openDoc.split(':').map(Number)
        return openVisit(visitId, docId)
      }
      const openButton = event.target.closest('[data-open-visit]')
      if (openButton) return openVisit(Number(openButton.dataset.openVisit))
      const trashButton = event.target.closest('[data-trash-visit]')
      if (trashButton) return trashVisit(Number(trashButton.dataset.trashVisit))
      const removeMeasure = event.target.closest('[data-remove-measure]')
      if (removeMeasure) {
        patient.measures = (patient.measures || []).filter((item) => item.id !== removeMeasure.dataset.removeMeasure)
        saveStore()
        renderPatientRecord(patient)
        return
      }
      const download = event.target.closest('[data-download-file]')
      if (download) return downloadAttachment(download.dataset.downloadFile)
      const removeFile = event.target.closest('[data-remove-file]')
      if (removeFile) {
        const confirmed = await window.ui.confirm({ title: 'Excluir arquivo?', message: 'O arquivo sera apagado deste computador.', confirmLabel: 'Excluir', danger: true })
        if (!confirmed) return
        await window.attachmentsDb.remove(removeFile.dataset.removeFile)
        toast('Arquivo excluido.')
        renderAttachments(patient.id)
        return
      }
      const action = event.target.closest('[data-action]')?.dataset.action
      if (action === 'new-visit') startVisitForPatient(patient)
      if (action === 'edit') {
        recordState.editing = !recordState.editing
        renderPatientRecord(patient)
      }
      if (action === 'delete-patient') trashPatient(patient.id)
      if (action === 'summary') generatePatientSummary(patient)
      if (action === 'attach') $('#attachmentInput').click()
      if (action === 'save-patient') {
        const values = {}
        host.querySelectorAll('[data-field]').forEach((input) => { values[input.dataset.field] = input.value.trim() })
        if (!values.name) return toast('O nome do paciente e obrigatorio.', 'warn')
        Object.assign(patient, values)
        patient.unnamed = false
        patient.age = ageFromBirth(patient.birthDate) || patient.age || ''
        patient.key = (patient.document || patient.phone || patient.name).toLowerCase()
        recordState.editing = false
        saveStore()
        renderAll()
        toast('Dados do paciente atualizados.')
      }
      if (action === 'add-measure') {
        const type = host.querySelector('[data-measure="type"]').value
        const parsed = parseMeasure(type, host.querySelector('[data-measure="value"]').value)
        const date = host.querySelector('[data-measure="date"]').value || new Date().toISOString().slice(0, 10)
        if (!parsed) return toast(`Valor invalido. Exemplo: ${MEASURES[type].placeholder}`, 'warn')
        patient.measures = [...(patient.measures || []), { id: uid(), type, date, ...parsed }]
        recordState.measureType = type
        saveStore()
        renderPatientRecord(patient)
        toast(`${MEASURES[type].label} registrada.`)
      }
    })
    host.addEventListener('change', (event) => {
      const patient = selectedPatient()
      if (!patient) return
      if (event.target.matches('[data-measure="type"]')) {
        recordState.measureType = event.target.value
        renderPatientRecord(patient)
      }
      if (event.target.id === 'attachmentInput') {
        const file = event.target.files?.[0]
        event.target.value = ''
        attachFile(patient, file).catch((error) => toast(error.message || 'Falha ao anexar arquivo.', 'error'))
      }
    })
  }

  // ---------------------------------------------------------------------------
  // 4. Agent chat
  // ---------------------------------------------------------------------------

  const AGENT_SUGGESTIONS = [
    'Resuma o caso em 5 linhas',
    'Liste diagnosticos diferenciais com o que falta investigar',
    'Verifique interacoes entre os medicamentos citados',
    'Gere orientacoes ao paciente em linguagem simples',
    'Aponte lacunas na anamnese e no exame fisico',
    'Sugira exames complementares com justificativa'
  ]
  const agentState = { busy: false, dictation: null }

  function agentContext() {
    const context = getContext()
    if (context.reason && context.consent) return context
    // Questions typed or dictated by the professional do not record a patient conversation.
    return {
      ...context,
      specialty: context.specialty || store.settings.doctorSpecialty || 'Clinica medica',
      visitType: 'Discussao de caso',
      reason: context.reason || 'Pergunta clinica ao agente MedVoz',
      consent: true,
      mode: 'Discussao de caso'
    }
  }

  function renderAgentChat() {
    const host = $('#agentMessages')
    const messages = store.agentChat
    if (!messages.length && !agentState.busy) {
      host.innerHTML = `<div class="agent-welcome">
        <span class="agent-welcome-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 4.6 4.6 1.9-4.6 1.9L12 16l-1.9-4.6-4.6-1.9 4.6-1.9z"/></svg></span>
        <strong>Como posso ajudar neste caso?</strong>
        <span>Pergunte por texto ou voz. O agente usa a transcricao do atendimento atual como contexto.</span>
      </div>`
    } else {
      host.innerHTML = messages.map((message, index) => message.role === 'user'
        ? `<div class="chat-msg chat-user"><p>${escapeHtml(message.text).replace(/\n/g, '<br>')}</p></div>`
        : `<div class="chat-msg chat-agent ${message.error ? 'is-error' : ''}">
            <div class="rich-text">${message.error ? `<p>${escapeHtml(message.text)}</p>` : textToHtml(message.text)}</div>
            ${message.error ? '' : `<div class="chat-actions"><button type="button" data-chat-copy="${index}">Copiar</button><button type="button" data-chat-insert="${index}">Inserir no documento</button></div>`}
          </div>`).join('') + (agentState.busy ? '<div class="chat-msg chat-agent chat-typing" aria-label="Agente digitando"><span></span><span></span><span></span></div>' : '')
    }
    host.scrollTop = host.scrollHeight
    $('#agentSuggestions').innerHTML = AGENT_SUGGESTIONS.map((text) => `<button type="button" class="suggestion-chip">${escapeHtml(text)}</button>`).join('')
  }

  function renderAgentContext() {
    const context = getContext()
    const words = $('#transcriptText').value.trim().split(/\s+/).filter(Boolean).length
    const useTranscript = $('#agentUseTranscript').checked
    $('#agentContext').innerHTML = [
      `<div><small>Paciente</small><span>${escapeHtml(context.patientName || 'nenhum no atendimento atual')}</span></div>`,
      `<div><small>Motivo</small><span>${escapeHtml(context.reason || 'nao informado')}</span></div>`,
      `<div><small>Especialidade</small><span>${escapeHtml(context.specialty || '-')}</span></div>`,
      `<div><small>Transcricao</small><span>${useTranscript ? (words ? `${words} palavras em uso` : 'sem transcricao no momento') : 'desligada para o agente'}</span></div>`
    ].join('')
  }

  async function sendAgentMessage() {
    if (agentState.busy) return
    const input = $('#agentPrompt')
    const prompt = input.value.trim()
    if (!prompt) {
      input.focus()
      return
    }
    store.agentChat.push({ role: 'user', text: prompt, at: new Date().toISOString() })
    input.value = ''
    agentState.busy = true
    saveStore()
    renderAgentChat()
    renderOnboarding()
    try {
      const history = store.agentChat.slice(-7, -1).map((message) => `${message.role === 'user' ? 'Medico' : 'Agente'}: ${message.text.slice(0, 1200)}`).join('\n')
      const transcript = $('#agentUseTranscript').checked ? $('#transcriptText').value.trim() : ''
      const result = await window.medvozApi.generateClinicalDocument({
        transcript: [
          transcript && `Transcricao do atendimento atual:\n${transcript}`,
          history && `Conversa anterior com o agente:\n${history}`,
          `Pergunta do agente: ${prompt}`
        ].filter(Boolean).join('\n\n'),
        context: agentContext(),
        patient: getPatientDraft(),
        clinician: getClinicianDraft(),
        documentType: 'analise_agente_clinico',
        tone: $('#tone').value,
        detailLevel: $('#detailLevel').value
      })
      store.agentChat.push(result?.ok
        ? { role: 'assistant', text: result.document || '', at: new Date().toISOString() }
        : { role: 'assistant', text: result?.message || 'Falha na analise.', error: true, at: new Date().toISOString() })
    } catch (error) {
      store.agentChat.push({ role: 'assistant', text: error.message || 'Falha na analise.', error: true, at: new Date().toISOString() })
    } finally {
      agentState.busy = false
      saveStore()
      renderAgentChat()
    }
  }

  async function toggleDictation() {
    const button = $('#btnAgentDictate')
    if (agentState.dictation) {
      agentState.dictation.stop()
      return
    }
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (error) {
      toast('Nao foi possivel acessar o microfone.', 'error')
      return
    }
    const chunks = []
    const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm' })
    const limit = setTimeout(() => recorder.state !== 'inactive' && recorder.stop(), 60000)
    agentState.dictation = recorder
    button.classList.add('is-recording')
    button.title = 'Parar e transcrever'
    recorder.ondataavailable = (event) => event.data?.size && chunks.push(event.data)
    recorder.onstop = async () => {
      clearTimeout(limit)
      stream.getTracks().forEach((track) => track.stop())
      agentState.dictation = null
      button.classList.remove('is-recording')
      button.classList.add('is-busy')
      button.title = 'Ditar pergunta'
      try {
        const blob = new Blob(chunks, { type: recorder.mimeType })
        if (blob.size < 2000) return toast('Nao captei audio. Tente falar mais perto do microfone.', 'warn')
        const result = await window.medvozApi.transcribeAudio({
          audioBytes: Array.from(new Uint8Array(await blob.arrayBuffer())),
          mimeType: blob.type,
          fileName: 'pergunta-agente.webm',
          diarize: false,
          context: agentContext()
        })
        if (!result?.ok) return toast(result?.message || 'Nao foi possivel transcrever a pergunta.', 'error')
        const input = $('#agentPrompt')
        input.value = [input.value.trim(), String(result.text || '').trim()].filter(Boolean).join(' ')
        input.focus()
      } catch (error) {
        toast(error.message || 'Falha ao transcrever a pergunta.', 'error')
      } finally {
        button.classList.remove('is-busy')
      }
    }
    recorder.start()
    toast('Ouvindo... clique de novo no microfone para terminar.', 'info')
  }

  function setupAgentChat() {
    $('#agentPrompt').addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        $('#btnAskAgent').click()
      }
    })
    $('#agentSuggestions').addEventListener('click', (event) => {
      const chipButton = event.target.closest('.suggestion-chip')
      if (!chipButton) return
      $('#agentPrompt').value = chipButton.textContent
      $('#agentPrompt').focus()
    })
    $('#agentMessages').addEventListener('click', async (event) => {
      const copy = event.target.closest('[data-chat-copy]')
      if (copy) {
        await navigator.clipboard.writeText(store.agentChat[Number(copy.dataset.chatCopy)]?.text || '')
        toast('Resposta copiada.')
        return
      }
      const insert = event.target.closest('[data-chat-insert]')
      if (insert) {
        const text = store.agentChat[Number(insert.dataset.chatInsert)]?.text || ''
        const editor = $('#docEditor')
        editor.insertAdjacentHTML('beforeend', textToHtml(`\n${text}`).replace(/^<h2>(.*?)<\/h2>/, '<p><strong>$1</strong></p>'))
        syncEditorToTextarea()
        toast('Resposta inserida no documento do atendimento.', 'ok', { action: { label: 'Ver', onClick: () => switchPage('atendimento') } })
      }
    })
    $('#btnAgentDictate').addEventListener('click', () => toggleDictation())
    $('#btnNewAgentChat').addEventListener('click', () => {
      if (!store.agentChat.length) return
      const previous = store.agentChat
      store.agentChat = []
      saveStore()
      renderAgentChat()
      toast('Nova conversa iniciada.', 'ok', {
        action: {
          label: 'Desfazer',
          onClick: () => {
            store.agentChat = previous
            saveStore()
            renderAgentChat()
          }
        }
      })
    })
    $('#agentUseTranscript').addEventListener('change', renderAgentContext)
    $('.nav-button[data-page="agente"]').addEventListener('click', renderAgentContext)
    renderAgentChat()
  }

  // ---------------------------------------------------------------------------
  // 7. Onboarding checklist
  // ---------------------------------------------------------------------------

  const ONBOARDING_STEPS = [
    { title: 'Preencha seus dados profissionais', text: 'Nome, CRM e clinica aparecem no timbrado dos documentos.', page: 'configuracoes', done: () => Boolean(store.settings.doctorName && store.settings.doctorCrm) },
    { title: 'Salve o primeiro atendimento', text: 'Grave ou importe um audio, revise e salve.', page: 'atendimento', done: () => store.visits.length > 0 },
    { title: 'Gere um documento com a IA', text: 'SOAP, evolucao, receita, atestado e outros.', page: 'atendimento', done: () => store.visits.some((visit) => visit.document) },
    { title: 'Crie um modelo no seu jeito de escrever', text: 'Personalize a estrutura dos seus documentos.', page: 'documentos', done: () => store.customTemplates.length > 0 },
    { title: 'Salve um PDF com o seu timbrado', text: 'Adicione o logo em Ajustes e exporte o documento.', page: 'atendimento', done: () => Boolean(onboarding.pdfExported) },
    { title: 'Faca uma pergunta ao agente clinico', text: 'Diferenciais, interacoes, orientacoes ao paciente.', page: 'agente', done: () => store.agentChat.some((message) => message.role === 'user') }
  ]

  function renderOnboarding() {
    const card = $('#onboardingCard')
    const results = ONBOARDING_STEPS.map((step) => ({ ...step, complete: step.done() }))
    const doneCount = results.filter((step) => step.complete).length
    card.hidden = Boolean(onboarding.hidden) || doneCount === results.length
    if (card.hidden) return
    $('#onboardingBar').style.width = `${Math.round((doneCount / results.length) * 100)}%`
    $('#onboardingCount').textContent = `${doneCount} de ${results.length} passos concluidos`
    $('#onboardingSteps').innerHTML = results.map((step, index) => `
      <div class="onboarding-step ${step.complete ? 'is-done' : ''}">
        <span class="onboarding-check" aria-hidden="true">${step.complete ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>' : index + 1}</span>
        <div><strong>${step.title}</strong><span>${step.text}</span></div>
        ${step.complete ? '' : `<button type="button" class="secondary-button compact" data-onboarding-page="${step.page}">Ir</button>`}
      </div>`).join('')
  }

  function setupOnboarding() {
    $('#onboardingSteps').addEventListener('click', (event) => {
      const button = event.target.closest('[data-onboarding-page]')
      if (button) switchPage(button.dataset.onboardingPage)
    })
    $('#btnHideOnboarding').addEventListener('click', () => {
      onboarding.hidden = true
      saveOnboarding()
      renderOnboarding()
      toast('Checklist ocultado.', 'ok', {
        action: {
          label: 'Desfazer',
          onClick: () => {
            onboarding.hidden = false
            saveOnboarding()
            renderOnboarding()
          }
        }
      })
    })
  }

  // ---------------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------------

  function renderExtras() {
    renderTrash()
    renderOnboarding()
    renderAgentContext()
  }

  Object.assign(window, {
    getDocumentHtml,
    setDocumentHtml,
    copyDocument,
    renderPatientRecord,
    renderExtras,
    trashVisit,
    sendAgentMessage
  })

  purgeOldTrash()
  setupTranscriptView()
  setupDocumentEditor()
  setupLogoField()
  setupPatientRecord()
  setupAgentChat()
  setupOnboarding()
  $('#trashList').addEventListener('click', (event) => {
    const restore = event.target.closest('[data-restore]')
    if (restore) return restoreTrash(restore.dataset.restore)
    const forever = event.target.closest('[data-forever]')
    if (forever) deleteTrashForever(forever.dataset.forever)
  })
  $('#btnEmptyTrash').addEventListener('click', emptyTrash)
  renderAll()
})()
