;(function mountMicVisualizer() {
  /* Visual-only feedback: watches the recorder in app.js and shows the live mic level. */
  var BAR_COUNT = 36
  var SPEAK_THRESHOLD = 0.06

  var visual = document.getElementById('micVisual')
  var barsHost = document.getElementById('micBars')
  var label = document.getElementById('micLabel')
  var hint = document.getElementById('micHint')
  var navTab = document.querySelector('.nav-button[data-page="atendimento"]')
  if (!visual || !barsHost) return

  var bars = []
  for (var i = 0; i < BAR_COUNT; i++) {
    var bar = document.createElement('i')
    barsHost.appendChild(bar)
    bars.push(bar)
  }

  var audioCtx = null
  var analyser = null
  var source = null
  var freq = null
  var wave = null
  var currentStream = null
  var level = 0
  var lastState = ''
  var speakHold = 0

  function attach(stream) {
    detach()
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext
      audioCtx = new Ctx()
      analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.75
      source = audioCtx.createMediaStreamSource(stream)
      source.connect(analyser)
      freq = new Uint8Array(analyser.frequencyBinCount)
      wave = new Uint8Array(analyser.fftSize)
      currentStream = stream
    } catch (error) {
      detach()
      currentStream = stream
    }
  }

  function detach() {
    try { if (source) source.disconnect() } catch (error) {}
    try { if (audioCtx) audioCtx.close() } catch (error) {}
    audioCtx = null
    analyser = null
    source = null
    currentStream = null
  }

  function setState(state, title, sub) {
    if (state === lastState && label.textContent === title) return
    lastState = state
    visual.dataset.state = state
    label.textContent = title
    hint.textContent = sub
    if (navTab) {
      navTab.classList.toggle('is-recording', state === 'listening' || state === 'speaking')
      navTab.classList.toggle('is-paused', state === 'paused')
    }
  }

  function paintBars(values) {
    for (var i = 0; i < BAR_COUNT; i++) {
      bars[i].style.transform = 'scaleY(' + Math.max(0.08, Math.min(1, values[i])).toFixed(3) + ')'
    }
  }

  var flat = new Array(BAR_COUNT).fill(0.08)

  function frame() {
    var app = typeof store !== 'undefined' ? store : null
    var recorder = app && app.recorder
    var stream = app && app.stream
    var recState = recorder ? recorder.state : 'inactive'
    var live = recState !== 'inactive' && stream && stream.active

    if (live && stream !== currentStream) attach(stream)
    if (!live && currentStream) detach()

    if (!live) {
      level = 0
      paintBars(flat)
      visual.style.setProperty('--level', '0')
      setState('idle', 'Microfone desligado', 'Clique em Iniciar para gravar')
    } else if (recState === 'paused') {
      level *= 0.8
      paintBars(flat)
      visual.style.setProperty('--level', '0')
      setState('paused', 'Gravacao pausada', 'Clique em Retomar para continuar')
    } else {
      var values = new Array(BAR_COUNT)
      var rms = 0
      if (analyser) {
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(function () {})
        analyser.getByteFrequencyData(freq)
        analyser.getByteTimeDomainData(wave)
        for (var w = 0; w < wave.length; w++) {
          var v = (wave[w] - 128) / 128
          rms += v * v
        }
        rms = Math.sqrt(rms / wave.length)
        // Mirror the voice band (low bins) from the center outward.
        var half = BAR_COUNT / 2
        for (var b = 0; b < half; b++) {
          var bin = 2 + Math.floor(b * 1.6)
          var amp = (freq[bin] || 0) / 255
          var h = 0.08 + Math.pow(amp, 1.4) * 1.1
          values[half - 1 - b] = h
          values[half + b] = h
        }
      } else {
        values = flat
      }
      level = level * 0.75 + Math.min(1, rms * 4) * 0.25
      visual.style.setProperty('--level', level.toFixed(3))
      paintBars(values)

      if (rms > SPEAK_THRESHOLD) speakHold = 18
      else if (speakHold > 0) speakHold--

      if (speakHold > 0) setState('speaking', 'Captando voz', 'Audio chegando ao microfone')
      else setState('listening', 'Ouvindo...', 'Fale para ver o nivel do microfone')
    }

    window.requestAnimationFrame(frame)
  }

  window.requestAnimationFrame(frame)
})()
