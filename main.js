function drawAtFPS(fps, func) {
  const interval = 1000 / fps
  let then = Date.now()

  function draw() {
    const now = Date.now()
    const elapsed = now - then
    requestAnimationFrame(draw)

    if (elapsed > interval) {
      then = now - (elapsed % interval)
      func()
    }
  }

  draw()
}

function encapsulate(func) {
  func()
}

function join(events, joiner = func(), context) {
  const joinContext = {}

  for (key in context || {}) {
    joinContext[key] = context[key]
  }

  for (event in events) {
    const handler = events[event]

    document.addEventListener(event, function(e) {
      if (typeof handler === 'string') {
        joinContext[handler] = e.detail
      } else if (typeof handler === 'function') {
        handler(e, joinContext)
      } else {
        console.error('Join handler must be of types string or function')
      }

      joiner(joinContext)
    })
  }
}

function once(event, func) {
  function handler(e) {
    document.removeEventListener(event, handler)
    func(e)
  }

  document.addEventListener(event, handler)
}

document.addEventListener('DOMContentLoaded', function() {
  const canvas = document.querySelector('#canvas')
  const canvasCtx = canvas.getContext('2d')

  function onResize() {
    const geometry = document.body.getBoundingClientRect()
    canvas.width = geometry.width
    canvas.height = geometry.height
  }

  function runAudio(audio) {
    console.log(audio.src)
    audio.play()

    return async function() {
      await audio.pause()
      audio.src = null
    }
  }

  function runVisualization(layers) {
    drawAtFPS(60, function() {
      canvasCtx.clearRect(0, 0, canvas.width, canvas.height)
      for (layer of layers) {
        layer()
      }
    })
  }

  window.addEventListener('resize', onResize)

  document.querySelector('#file-picker').addEventListener('change', function({
    target: {
      files: [file],
    },
  }) {
    const audio = new Audio()
    audio.src = URL.createObjectURL(file)

    document.dispatchEvent(new CustomEvent('audio-ready', { detail: audio }))
  })

  once('audio-ready', function() {
    document.dispatchEvent(
      new CustomEvent('audio-context-config-change', { detail: {} })
    )
  })

  encapsulate(function() {
    let audioContext = null

    async function handler({ detail: { audioContextOptions } }) {
      if (audioContext === null) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)(
          audioContextOptions
        )

        document.dispatchEvent(
          new CustomEvent('audio-context-ready', { detail: audioContext })
        )
      } else {
        await audioContext.close()
        audioContext = null
        handler({ detail: { audioContextOptions } })
      }
    }

    document.addEventListener('audio-context-config-change', handler)
  })

  document.addEventListener('audio-file-change', function({ detail }) {
    const audio = new Audio()
    audio.src = detail

    document.dispatchEvent(new CustomEvent('audio-ready', { detail: audio }))
  })

  join(
    {
      'audio-ready': 'audio',
      'audio-context-ready': 'audioContext',
    },
    function({ audio, audioContext }) {
      if (audio && audioContext) {
        const mediaElementSource = audioContext.createMediaElementSource(audio)

        document.dispatchEvent(
          new CustomEvent('media-element-source-ready', {
            detail: mediaElementSource,
          })
        )
      }
    }
  )

  join(
    {
      'audio-context-ready': 'audioContext',
      'config-ready': 'config',
      'media-element-source-ready': 'mediaElementSource',
    },
    function({ audioContext, config = {}, mediaElementSource }) {
      if (audioContext && mediaElementSource) {
        const audioAnalyserLeft = audioContext.createAnalyser()
        const audioAnalyserRight = audioContext.createAnalyser()
        const channelSplitter = audioContext.createChannelSplitter(2)
        const channelMerger = audioContext.createChannelMerger(2)
        mediaElementSource.connect(channelSplitter)
        channelSplitter.connect(audioAnalyserLeft, 0, 0)
        channelSplitter.connect(audioAnalyserRight, 1, 0)
        audioAnalyserLeft.connect(channelMerger, 0, 0)
        audioAnalyserRight.connect(channelMerger, 0, 1)
        channelMerger.connect(audioContext.destination)

        if (config.fftSize) {
          audioAnalyserLeft.fftSize = config.fftSize
          audioAnalyserRight.fftSize = config.fftSize
        }

        document.dispatchEvent(
          new CustomEvent('audio-graph-ready', {
            detail: { audioAnalyserLeft, audioAnalyserRight },
          })
        )
      }
    }
  )

  encapsulate(function() {
    let stopAudio = null

    join(
      {
        'audio-ready': 'audio',
        'audio-graph-ready': function({ detail }, context) {
          ;(context.audioAnalyserLeft = detail.audioAnalyserLeft),
            (context.audioAnalyserRight = detail.audioAnalyserRight)
        },
        'config-ready': 'config',
      },
      function({ audio, audioAnalyserLeft, audioAnalyserRight, config = {} }) {
        if (audio && audioAnalyserLeft && audioAnalyserRight) {
          if (stopAudio) {
            stopAudio()
            stopAudio = null
          }

          stopAudio = runAudio(audio)

          runVisualization([
            getStereoSplitWaveformVisualizer(
              audioAnalyserLeft,
              canvas,
              canvasCtx,
              {
                bands: config.bands,
              }
            ),
            getStereoSplitWaveformVisualizer(
              audioAnalyserRight,
              canvas,
              canvasCtx,
              {
                bands: config.bands,
                flip: true,
              }
            ),
          ])
        }
      }
    )
  })

  onResize()

  document.dispatchEvent(
    new CustomEvent('config-ready', {
      detail: {
        bands: 32,
        fftSize: Math.pow(2, 12),
      },
    })
  )
})
