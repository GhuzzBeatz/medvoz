;(function mountUiKit() {
  /* Shared UI pieces: toasts, confirm dialog and a small IndexedDB store for patient files. */

  var ICONS = {
    ok: '<path d="M20 6 9 17l-5-5"/>',
    error: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/>',
    warn: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.5"/>'
  }

  function escapeText(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]
    })
  }

  function toastHost() {
    var host = document.getElementById('toastHost')
    if (host) return host
    host = document.createElement('div')
    host.id = 'toastHost'
    host.className = 'toast-host'
    host.setAttribute('role', 'status')
    host.setAttribute('aria-live', 'polite')
    document.body.appendChild(host)
    return host
  }

  function toast(message, type, options) {
    var kind = ICONS[type] ? type : 'ok'
    var opts = options || {}
    var el = document.createElement('div')
    el.className = 'toast toast-' + kind
    el.innerHTML =
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[kind] + '</svg>' +
      '<span class="toast-text">' + escapeText(message) + '</span>' +
      (opts.action ? '<button type="button" class="toast-action">' + escapeText(opts.action.label) + '</button>' : '') +
      '<button type="button" class="toast-close" aria-label="Fechar aviso">&#10005;</button>'
    var timer = null
    function close() {
      clearTimeout(timer)
      el.classList.add('is-leaving')
      setTimeout(function () { el.remove() }, 200)
    }
    el.querySelector('.toast-close').addEventListener('click', close)
    if (opts.action) {
      el.querySelector('.toast-action').addEventListener('click', function () {
        close()
        opts.action.onClick()
      })
    }
    toastHost().appendChild(el)
    timer = setTimeout(close, opts.duration || (opts.action ? 6500 : 3200))
    return close
  }

  function confirmDialog(options) {
    var opts = options || {}
    return new Promise(function (resolve) {
      var previous = document.activeElement
      var backdrop = document.createElement('div')
      backdrop.className = 'modal-backdrop'
      backdrop.innerHTML =
        '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">' +
        '<h3 id="modalTitle">' + escapeText(opts.title || 'Confirmar') + '</h3>' +
        '<p>' + escapeText(opts.message || '') + '</p>' +
        '<div class="button-row modal-actions">' +
        '<button type="button" class="secondary-button" data-answer="no">' + escapeText(opts.cancelLabel || 'Cancelar') + '</button>' +
        '<button type="button" class="' + (opts.danger ? 'danger-button' : 'primary-button') + '" data-answer="yes">' + escapeText(opts.confirmLabel || 'Confirmar') + '</button>' +
        '</div></div>'
      function finish(answer) {
        document.removeEventListener('keydown', onKey, true)
        backdrop.classList.add('is-leaving')
        setTimeout(function () { backdrop.remove() }, 150)
        if (previous && previous.focus) previous.focus()
        resolve(answer)
      }
      function onKey(event) {
        if (event.key === 'Escape') { event.preventDefault(); finish(false) }
      }
      backdrop.addEventListener('click', function (event) {
        if (event.target === backdrop) return finish(false)
        var button = event.target.closest('[data-answer]')
        if (button) finish(button.dataset.answer === 'yes')
      })
      document.addEventListener('keydown', onKey, true)
      document.body.appendChild(backdrop)
      backdrop.querySelector('[data-answer="yes"]').focus()
    })
  }

  var dbPromise = null
  function openDb() {
    if (dbPromise) return dbPromise
    dbPromise = new Promise(function (resolve, reject) {
      var request = indexedDB.open('medvoz', 1)
      request.onupgradeneeded = function () {
        var store = request.result.createObjectStore('attachments', { keyPath: 'id' })
        store.createIndex('patientId', 'patientId', { unique: false })
      }
      request.onsuccess = function () { resolve(request.result) }
      request.onerror = function () { reject(request.error) }
    })
    return dbPromise
  }

  function tx(mode, work) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var transaction = db.transaction('attachments', mode)
        var result = work(transaction.objectStore('attachments'))
        transaction.oncomplete = function () { resolve(result && 'result' in result ? result.result : undefined) }
        transaction.onerror = function () { reject(transaction.error) }
      })
    })
  }

  window.ui = { toast: toast, confirm: confirmDialog, escape: escapeText }
  window.attachmentsDb = {
    add: function (record) { return tx('readwrite', function (store) { return store.put(record) }) },
    listByPatient: function (patientId) {
      return tx('readonly', function (store) { return store.index('patientId').getAll(patientId) })
    },
    get: function (id) { return tx('readonly', function (store) { return store.get(id) }) },
    remove: function (id) { return tx('readwrite', function (store) { return store.delete(id) }) },
    removeByPatient: function (patientId) {
      return window.attachmentsDb.listByPatient(patientId).then(function (items) {
        return Promise.all((items || []).map(function (item) { return window.attachmentsDb.remove(item.id) }))
      })
    }
  }
})()
