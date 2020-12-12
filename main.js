function drawAtFPS(fps, func) {
  const interval = 1000 / fps
  let then = Date.now()
  let stop = false

  function draw() {
    const now = Date.now()
    const elapsed = now - then
    requestAnimationFrame(draw)

    if (elapsed > interval) {
      then = now - (elapsed % interval)
      func()
    }
  }

  if (!stop) {
    draw()
  }

  return function() {
    stop = true
  }
}

function encapsulate(func) {
  func()
}

function whenAll(values, action) {
  if (values.every((x) => !!(typeof x === 'function' ? x() : x))) {
    action()
  }
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
    audio.play()

    return async function() {
      await audio.pause()
      audio.src = null
    }
  }

  function runVisualization(layers) {
    return drawAtFPS(60, function() {
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

  document
    .querySelector('#visualization-picker')
    .addEventListener('change', function({ target }) {
      document.dispatchEvent(
        new CustomEvent('visualization.selected', { detail: target.value })
      )
    })

  once('audio-ready', function() {
    document.dispatchEvent(
      new CustomEvent('audio-context-config-change', { detail: {} })
    )
  })

  // vizualization-picker: populate
  join(
    {
      'visualization-picker-ready': 'visualizationPicker',
      'config-ready': function({ detail: { visualizations } }, context) {
        context.visualizations = visualizations
      },
    },
    function({ visualizationPicker, visualizations }) {
      if (visualizationPicker && visualizations) {
        visualizationPicker.innerHtml = ''

        for (const [key, { name }] of Object.entries(visualizations)) {
          const node = document.createElement('option')
          node.appendChild(document.createTextNode(name))
          node.value = key
          visualizationPicker.appendChild(node)
        }

        document.dispatchEvent(
          new CustomEvent('visualization.selected', {
            detail: visualizationPicker.value,
          })
        )
      }
    }
  )

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

  // visualization: run
  encapsulate(function() {
    let currentAudio = null
    let currentVisualization = null
    let stopAudio = null
    let stopVisualization = null

    join(
      {
        'audio-ready': 'audio',
        'audio-graph-ready': function({ detail }, context) {
          ;(context.audioAnalyserLeft = detail.audioAnalyserLeft),
            (context.audioAnalyserRight = detail.audioAnalyserRight)
        },
        'config-ready': function({ detail }, context) {
          context.visualizerConfig = detail.visualizer
          context.visualizations = detail.visualizations
        },
        'visualization.selected': 'visualization',
      },
      function({
        audio,
        audioAnalyserLeft,
        audioAnalyserRight,
        visualization,
        visualizations,
        visualizerConfig = {},
      }) {
        whenAll(
          [
            audio,
            audioAnalyserLeft,
            audioAnalyserRight,
            visualization,
            visualizations,
            visualizerConfig,
          ],
          function() {
            const { visualizer } = visualizations[visualization]

            if (audio !== currentAudio) {
              if (stopAudio) {
                stopAudio()
                stopAudio = null
              }

              stopAudio = runAudio(audio)
              currentAudio = audio
            }

            if (visualization !== currentVisualization) {
              if (stopVisualization) {
                stopVisualization()
                stopVisualization = null
              }

              stopVisualization = runVisualization([
                visualizer(
                  audioAnalyserLeft,
                  canvas,
                  canvasCtx,
                  visualizerConfig
                ),
                visualizer(audioAnalyserRight, canvas, canvasCtx, {
                  ...visualizerConfig,
                  flip: true,
                }),
              ])
            }
          }
        )
      }
    )
  })

  onResize()

  document.dispatchEvent(
    new CustomEvent('visualization-picker-ready', {
      detail: document.querySelector('#visualization-picker'),
    })
  )

  document.dispatchEvent(
    new CustomEvent('config-ready', {
      detail: {
        visualizer: {
          bands: 32,
          fftSize: Math.pow(2, 12),
        },
        visualizations: {
          bands: { name: 'Bands', visualizer: getBandVisualizer },
          'stereo-split-waveform': {
            name: 'Stereo Split',
            visualizer: getStereoSplitWaveformVisualizer,
          },
        },
      },
    })
  )
})
