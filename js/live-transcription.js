;(function mountLiveTranscription() {
  /*
   * Near-live transcription: a second recorder cuts the stream into short, self-contained
   * segments and sends each one to the existing GHZ transcription endpoint, in order.
   * Text is only shown after the health-subject gate approves it.
   */
  var SEGMENT_MS = 8000
  var MIN_SEGMENT_BYTES = 4000
  var GATE_MIN_CHARS = 160
  var HALLUCINATIONS = /amara\.org|legendas pela comunidade|obrigad[oa] por assistir|inscreva-se no canal|legendado por/i

  var state = null

  function pickMime() {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus'
    return 'audio/webm'
  }

  function emitStatus(text, kind) {
    if (state && state.opts.onStatus) state.opts.onStatus(text, kind || '')
  }

  function startSegment() {
    if (!state || state.stopped || state.paused || state.blocked) return
    var current = state
    var chunks = []
    var recorder
    try {
      recorder = new MediaRecorder(current.stream, { mimeType: pickMime() })
    } catch (error) {
      emitStatus('Transcricao ao vivo indisponivel neste dispositivo.', 'status-warn')
      return
    }
    current.recorder = recorder
    recorder.ondataavailable = function (event) {
      if (event.data && event.data.size) chunks.push(event.data)
    }
    recorder.onstop = function () {
      var blob = new Blob(chunks, { type: recorder.mimeType || pickMime() })
      enqueue(current, blob)
      if (current.onSegmentClosed) {
        var done = current.onSegmentClosed
        current.onSegmentClosed = null
        done()
      }
      if (state === current && !current.stopped && !current.paused) startSegment()
    }
    recorder.start()
    current.timer = setTimeout(function () {
      if (recorder.state !== 'inactive') recorder.stop()
    }, SEGMENT_MS)
  }

  function closeSegment(current) {
    clearTimeout(current.timer)
    var recorder = current.recorder
    if (!recorder || recorder.state === 'inactive') return Promise.resolve()
    return new Promise(function (resolve) {
      current.onSegmentClosed = resolve
      try { recorder.stop() } catch (error) { resolve() }
    })
  }

  function enqueue(current, blob) {
    if (!blob || blob.size < MIN_SEGMENT_BYTES) return
    current.queue = current.queue.then(function () {
      return transcribeSegment(current, blob)
    }).catch(function () {})
  }

  async function transcribeSegment(current, blob) {
    if (current.blocked || current.cancelled) return
    current.index += 1
    current.pending += 1
    if (current.gate !== 'ok') emitStatus('Validando assunto de saude antes de mostrar o texto...', 'status-warn')
    try {
      var bytes = Array.from(new Uint8Array(await blob.arrayBuffer()))
      var result = await window.medvozApi.transcribeAudio({
        audioBytes: bytes,
        mimeType: blob.type || 'audio/webm',
        fileName: 'ao-vivo-' + current.index + '.webm',
        diarize: false,
        context: current.opts.getContext()
      })
      if (current.cancelled) return
      if (!result || !result.ok) {
        emitStatus((result && result.message) || 'Falha em um trecho da transcricao ao vivo. A gravacao continua.', 'status-warn')
        return
      }
      var text = String(result.text || '').trim()
      if (!text || HALLUCINATIONS.test(text)) return
      current.text = current.text ? current.text + ' ' + text : text
      await runGate(current)
      if (current.gate === 'ok' && !current.blocked) {
        current.opts.onText(current.text)
        emitStatus('Transcrevendo ao vivo. A versao final por participante chega ao encerrar.', 'status-ok')
      }
    } catch (error) {
      if (!current.cancelled) emitStatus('Falha em um trecho da transcricao ao vivo. A gravacao continua.', 'status-warn')
    } finally {
      current.pending -= 1
    }
  }

  async function runGate(current) {
    if (current.gate === 'ok' || current.text.length < GATE_MIN_CHARS) return
    var gate = await window.medvozApi.classifyTranscript({ transcript: current.text, context: current.opts.getContext() })
    if (current.cancelled) return
    if (gate && gate.ok && gate.medical) {
      current.gate = 'ok'
      return
    }
    if (gate && gate.medical === false) {
      current.blocked = true
      current.text = ''
      closeSegment(current)
      if (current.opts.onBlocked) current.opts.onBlocked(gate.message || 'Nao foi encontrado assunto de medicina/saude. A transcricao ao vivo foi interrompida.')
    }
    // Any other result (network, server) keeps the gate pending and retries on the next segment.
  }

  window.MedVozLive = {
    start: function (stream, opts) {
      this.cancel()
      state = {
        stream: stream,
        opts: opts,
        text: '',
        queue: Promise.resolve(),
        index: 0,
        pending: 0,
        gate: 'pending',
        blocked: false,
        paused: false,
        stopped: false,
        cancelled: false,
        recorder: null,
        timer: null,
        onSegmentClosed: null
      }
      emitStatus('Transcricao ao vivo ativa. O texto aparece apos validar o assunto de saude.', 'status-warn')
      startSegment()
    },
    pause: function () {
      if (!state || state.stopped) return
      state.paused = true
      closeSegment(state)
    },
    resume: function () {
      if (!state || state.stopped || !state.paused) return
      state.paused = false
      startSegment()
    },
    stop: async function () {
      if (!state) return { text: '', gateOk: false }
      var current = state
      current.stopped = true
      await closeSegment(current)
      await current.queue
      return { text: current.blocked ? '' : current.text, gateOk: current.gate === 'ok' && !current.blocked }
    },
    cancel: function () {
      if (!state) return
      state.cancelled = true
      state.stopped = true
      closeSegment(state)
      state = null
    },
    snapshot: function () {
      if (!state) return { text: '', gateOk: false }
      return { text: state.blocked ? '' : state.text, gateOk: state.gate === 'ok' && !state.blocked }
    }
  }
})()
