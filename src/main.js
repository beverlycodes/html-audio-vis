'use strict'

const { drawAtFPS } = modules.draw

const { createContext: createBlocksContext } = modules.blocks

const visualizers = {
  createBandVisualizer:
    modules.visualizers['io.github.beverlycodes.visualizers.bands']
      .createVisualizer,
  createStereoSplitWaveformVisualizer:
    modules.visualizers[
      'io.github.beverlycodes.visualizers.stereo-split-waveform'
    ].createVisualizer,
}

const blocks = createBlocksContext(document)

const actions = blocks.defineActions([
  'deliverAudio',
  'deliverAudioGraph',
  'deliverAudioContext',
  'deliverAudioContextConfig',
  'deliverConfig',
  'deliverMediaElementSource',
  'deliverVisualizationPicker',
  'selectVisualization',
])

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
      for (const layer of layers) {
        layer()
      }
    })
  }

  window.addEventListener('resize', onResize)

  // AudioContext: create with AudioContextConfig
  blocks.encapsulate(function() {
    let audioContext = null

    async function handler({ audioContextOptions }) {
      if (audioContext === null) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)(
          audioContextOptions
        )

        blocks.actions.deliverAudioContext(audioContext)
      } else {
        await audioContext.close()
        audioContext = null
        handler({ audioContextOptions })
      }
    }

    actions.deliverAudioContextConfig.always(handler)
  })

  // AudioContextConfig: provide default options on first Audio
  /*
    This is temporary.  It provides a default set of AudioContext options the
    first time Audio is delivered.  This will be replaced if/when the interface
    provides user-configurable settings.
  */
  actions.deliverAudio.once(function() {
    actions.deliverAudioContextConfig({})
  })

  // AudioGraph: create from AudioContext, Config, and MediaElementSource
  blocks.join(
    [
      [actions.deliverAudioContext, 'audioContext'],
      [actions.deliverConfig, 'config'],
      [actions.deliverMediaElementSource, 'mediaElementSource'],
    ],
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

        actions.deliverAudioGraph({ audioAnalyserLeft, audioAnalyserRight })
      }
    }
  )

  // file-picker.change: create Audio from user selection
  document.querySelector('#file-picker').addEventListener('change', function({
    target: {
      files: [file],
    },
  }) {
    const audio = new Audio()
    audio.src = URL.createObjectURL(file)

    actions.deliverAudio(audio)
  })

  // MediaElementSource: create from Audio and AudioContext
  blocks.join(
    [
      [actions.deliverAudio, 'audio'],
      [actions.deliverAudioContext, 'audioContext'],
    ],
    function({ audio, audioContext }) {
      if (audio && audioContext) {
        actions.deliverMediaElementSource(
          audioContext.createMediaElementSource(audio)
        )
      }
    }
  )

  // Visualization: run when dependencies are met
  blocks.encapsulate(function() {
    let currentAudio = null
    let currentVisualization = null
    let stopAudio = null
    let stopVisualization = null

    blocks.join(
      [
        [actions.deliverAudio, 'audio'],
        [
          actions.deliverAudioGraph,
          function({ audioAnalyserLeft, audioAnalyserRight }, context) {
            context.audioAnalyserLeft = audioAnalyserLeft
            context.audioAnalyserRight = audioAnalyserRight
          },
        ],
        [
          actions.deliverConfig,
          function({ visualizer, visualizations }, context) {
            context.visualizerConfig = visualizer
            context.visualizations = visualizations
          },
        ],
        [actions.selectVisualization, 'visualization'],
      ],
      function({
        audio,
        audioAnalyserLeft,
        audioAnalyserRight,
        visualization,
        visualizations,
        visualizerConfig = {},
      }) {
        if (
          audio &&
          audioAnalyserLeft &&
          audioAnalyserRight &&
          visualization &&
          visualizations &&
          visualizerConfig
        ) {
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
      }
    )
  })

  // visualization-picker.change: select visualization
  document
    .querySelector('#visualization-picker')
    .addEventListener('change', function({ target }) {
      actions.selectVisualization(target.value)
    })

  // visualization-picker: populate options from Config
  blocks.join(
    [
      [actions.deliverVisualizationPicker, 'visualizationPicker'],
      [
        actions.deliverConfig,
        function({ visualizations }, context) {
          context.visualizations = visualizations
        },
      ],
    ],
    function({ visualizationPicker, visualizations }) {
      if (visualizationPicker && visualizations) {
        visualizationPicker.innerHtml = ''

        for (const [key, { name }] of Object.entries(visualizations)) {
          const node = document.createElement('option')
          node.appendChild(document.createTextNode(name))
          node.value = key
          visualizationPicker.appendChild(node)
        }

        actions.selectVisualization(visualizationPicker.value)
      }
    }
  )

  // Begin initialization process after all actions are hooked up

  onResize()

  actions.deliverVisualizationPicker(
    document.querySelector('#visualization-picker')
  )

  actions.deliverConfig({
    visualizer: {
      bands: 32,
      fftSize: Math.pow(2, 12),
    },
    visualizations: {
      bands: {
        name: 'Bands',
        visualizer: visualizers.createBandVisualizer,
      },
      'stereo-split-waveform': {
        name: 'Stereo Split',
        visualizer: visualizers.createStereoSplitWaveformVisualizer,
      },
    },
  })
})
