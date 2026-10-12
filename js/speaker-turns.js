;(function mountSpeakerTurns() {
  /*
   * Teleconsult speaker separation by audio source:
   *   microphone          -> Medico
   *   computer (loopback) -> Paciente
   * A small voice-activity detector watches both sources, cuts the conversation into turns,
   * records each turn from the speaker's own source and transcribes the turns in order.
   * Text is only shown after the health-subject gate approves it.
   */
  var TICK_MS = 50
  var HANGOVER_MS = 450
  var SWITCH_HOLD_MS = 200
  var END_SILENCE_MS = 1300
  var MAX_TURN_MS = 40000
  var MIN_TURN_MS = 600
  var MIN_TURN_BYTES = 3000
  var GATE_MIN_CHARS = 160
  var LABELS = { doctor: 'Medico', patient: 'Paciente' }
  var HALLUCINATIONS = /amara\.org|legendas pela comunidade|obrigad[oa] por assistir|inscreva-se no canal|legendado por/i

  var state = null

  function pickMime() {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus'
    return 'audio/webm'
  }

  function emitStatus(text, kind) {
    if (state && state.opts.onStatus) state.opts.onStatus(text, kind || '')
  }

  function createMeter(ctx, stream) {
    var analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    ctx.createMediaStreamSource(stream).connect(analyser)
    return { analyser: analyser, buffer: new Float32Array(analyser.fftSize), floor: 0.004, lastActive: 0, strength: 0 }
  }

  function measure(meter, now) {
    meter.analyser.getFloatTimeDomainData(meter.buffer)
    var sum = 0
    for (var i = 0; i < meter.buffer.length; i++) sum += meter.buffer[i] * meter.buffer[i]
    var rms = Math.sqrt(sum / meter.buffer.length)
    // Adaptive noise floor: follows quiet periods, ignores speech peaks.
    if (rms < meter.floor * 2.5) meter.floor = meter.floor * 0.97 + rms * 0.03
    var threshold = Math.max(0.012, meter.floor * 3.2)
    meter.strength = rms / threshold
    if (rms > threshold) meter.lastActive = now
    return now - meter.lastActive < HANGOVER_MS
  }

  function decideSpeaker(now) {
    var micOn = measure(state.mic, now)
    var sysOn = measure(state.sys, now)
    if (micOn && sysOn) {
      // With speakers, the microphone also hears the patient, but much weaker than the loopback.
      return state.mic.strength > state.sys.strength * 2 ? 'doctor' : 'patient'
    }
    if (sysOn) return 'patient'
    if (micOn) return 'doctor'
    return null
  }

  function openTurn(speaker, now) {
    var current = state
    var stream = speaker === 'doctor' ? current.micStream : current.sysStream
    var chunks = []
    var recorder
    try {
      recorder = new MediaRecorder(stream, { mimeType: pickMime() })
    } catch (error) {
      emitStatus('Nao foi possivel separar as vozes neste dispositivo.', 'status-warn')
      return
    }
    var turn = { speaker: speaker, startedAt: now, recorder: recorder, index: ++current.turnCount }
    recorder.ondataavailable = function (event) {
      if (event.data && event.data.size) chunks.push(event.data)
    }
    turn.closed = new Promise(function (resolve) {
      recorder.onstop = function () {
        var blob = new Blob(chunks, { type: recorder.mimeType || pickMime() })
        var duration = (turn.endedAt || Date.now()) - turn.startedAt
        if (blob.size >= MIN_TURN_BYTES && duration >= MIN_TURN_MS) enqueue(current, turn, blob)
        resolve()
      }
    })
    recorder.start()
    current.turn = turn
  }

  function closeTurn(now) {
    var turn = state && state.turn
    if (!turn) return Promise.resolve()
    state.turn = null
    turn.endedAt = now || Date.now()
    try {
      if (turn.recorder.state !== 'inactive') turn.recorder.stop()
    } catch (error) {}
    return turn.closed
  }

  function tick() {
    if (!state || state.stopped || state.paused || state.blocked) return
    var now = Date.now()
    var speaker = decideSpeaker(now)
    var turn = state.turn

    if (speaker) state.lastVoice = now
    if (!turn) {
      if (speaker) openTurn(speaker, now)
      return
    }
    if (speaker && speaker !== turn.speaker) {
      if (!state.pendingSince || state.pendingSpeaker !== speaker) {
        state.pendingSpeaker = speaker
        state.pendingSince = now
      }
      if (now - state.pendingSince >= SWITCH_HOLD_MS) {
        closeTurn(now)
        state.pendingSince = 0
        openTurn(speaker, now)
      }
      return
    }
    state.pendingSince = 0
    if (!speaker && now - state.lastVoice >= END_SILENCE_MS) {
      closeTurn(now)
      return
    }
    if (now - turn.startedAt >= MAX_TURN_MS) {
      closeTurn(now)
      openTurn(turn.speaker, now)
    }
  }

  function enqueue(current, turn, blob) {
    current.queue = current.queue.then(function () {
      return transcribeTurn(current, turn, blob)
    }).catch(function () {})
  }

  function renderText(current) {
    return current.turns.map(function (item) { return LABELS[item.speaker] + ': ' + item.text }).join('\n')
  }

  async function transcribeTurn(current, turn, blob) {
    if (current.blocked || current.cancelled) return
    if (current.gate !== 'ok') emitStatus('Validando assunto de saude antes de mostrar o texto...', 'status-warn')
    try {
      var result = await window.medvozApi.transcribeAudio({
        audioBytes: Array.from(new Uint8Array(await blob.arrayBuffer())),
        mimeType: blob.type || 'audio/webm',
        fileName: 'turno-' + turn.index + '-' + (turn.speaker === 'doctor' ? 'medico' : 'paciente') + '.webm',
        diarize: false,
        context: current.opts.getContext()
      })
      if (current.cancelled) return
      if (!result || !result.ok) {
        current.failures += 1
        emitStatus((result && result.message) || 'Falha em um trecho da transcricao. A gravacao continua.', 'status-warn')
        return
      }
      var text = String(result.text || '').trim()
      if (!text || HALLUCINATIONS.test(text)) return
      var last = current.turns[current.turns.length - 1]
      if (last && last.speaker === turn.speaker) last.text += ' ' + text
      else current.turns.push({ speaker: turn.speaker, text: text, startedAt: turn.startedAt })
      await runGate(current)
      if (current.gate === 'ok' && !current.blocked) {
        current.opts.onText(renderText(current))
        emitStatus('Teleconsulta: microfone = medico, som do computador = paciente.', 'status-ok')
      }
    } catch (error) {
      current.failures += 1
      if (!current.cancelled) emitStatus('Falha em um trecho da transcricao. A gravacao continua.', 'status-warn')
    }
  }

  async function runGate(current) {
    var text = renderText(current)
    if (current.gate === 'ok' || text.length < GATE_MIN_CHARS) return
    var gate = await window.medvozApi.classifyTranscript({ transcript: text, context: current.opts.getContext() })
    if (current.cancelled) return
    if (gate && gate.ok && gate.medical) {
      current.gate = 'ok'
      return
    }
    if (gate && gate.medical === false) {
      current.blocked = true
      current.turns = []
      closeTurn()
      if (current.opts.onBlocked) current.opts.onBlocked(gate.message || 'Nao foi encontrado assunto de medicina/saude. A transcricao foi interrompida.')
    }
  }

  function teardown(current) {
    clearInterval(current.timer)
    try { current.ctx.close() } catch (error) {}
  }

  window.MedVozTurns = {
    start: function (micStream, sysStream, opts) {
      this.cancel()
      var ctx = new (window.AudioContext || window.webkitAudioContext)()
      state = {
        opts: opts,
        micStream: micStream,
        sysStream: sysStream,
        ctx: ctx,
        mic: createMeter(ctx, micStream),
        sys: createMeter(ctx, sysStream),
        turns: [],
        turn: null,
        turnCount: 0,
        queue: Promise.resolve(),
        gate: 'pending',
        failures: 0,
        lastVoice: 0,
        pendingSince: 0,
        pendingSpeaker: null,
        paused: false,
        stopped: false,
        blocked: false,
        cancelled: false
      }
      state.timer = setInterval(tick, TICK_MS)
      emitStatus('Teleconsulta: separando medico (microfone) e paciente (som do computador).', 'status-warn')
    },
    pause: function () {
      if (!state || state.stopped) return
      state.paused = true
      closeTurn()
    },
    resume: function () {
      if (!state || state.stopped) return
      state.paused = false
      state.lastVoice = Date.now()
    },
    stop: async function () {
      if (!state) return { text: '', gateOk: false, turns: 0, failures: 0 }
      var current = state
      current.stopped = true
      await closeTurn()
      teardown(current)
      await current.queue
      var gateOk = current.gate === 'ok' && !current.blocked
      // Short consultations may end before the live gate ran; the caller validates the final text.
      return { text: current.blocked ? '' : renderText(current), gateOk: gateOk, blocked: current.blocked, turns: current.turns.length, failures: current.failures }
    },
    cancel: function () {
      if (!state) return
      state.cancelled = true
      state.stopped = true
      closeTurn()
      teardown(state)
      state = null
    },
    isActive: function () {
      return Boolean(state && !state.stopped)
    }
  }
})()
