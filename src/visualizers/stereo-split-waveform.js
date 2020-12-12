window.modules = window.modules || {}
window.modules.visualizers = window.modules.visualizers || {}

window.modules.visualizers[
  'io.github.beverlycodes.visualizers.stereo-split-waveform'
] = (function() {
  class RunningAverage {
    constructor() {
      this.sum = 0
      this.n = 0
    }

    add(value) {
      this.sum += value
      this.n += 1
    }

    clear() {
      this.sum = 0
      this.n = 0
    }

    calculate() {
      return this.sum / this.n
    }
  }

  function drawBar(
    canvasCtx,
    width,
    heightMax,
    pos,
    offset,
    isHigh,
    value,
    colorValue = value
  ) {
    const barHeight = value * heightMax
    const x = pos + width / 4
    const barWidth = width / 2

    canvasCtx.fillStyle = `hsl(${120 * colorValue + 240},${50 * colorValue +
      45}%,50%)`

    canvasCtx.fillRect(
      x,
      offset - (isHigh ? barHeight : 0),
      barWidth,
      barHeight
    )
  }

  function createVisualizer(
    audioAnalyser,
    canvas,
    canvasCtx,
    { bands = 32, flip = false, barRate = 25, enablePeak = false }
  ) {
    const fftSize = audioAnalyser.fftSize
    const timeDomainArray = new Float32Array(fftSize)
    const bars = Array(bands)

    let then = Date.now()
    let barThen = then

    let peakHigh = 0
    let peakLow = 0
    let rmsHigh = new RunningAverage()
    let rmsLow = new RunningAverage()

    return function() {
      const channelHeight = canvas.height / 2
      const offset = canvas.height / 2
      const now = Date.now()
      const delta = now - then
      const barElapsed = now - barThen
      const barCount = bars.length

      then = now

      audioAnalyser.getFloatTimeDomainData(timeDomainArray)

      for (i = 0; i < fftSize; i++) {
        const sample = timeDomainArray[i]
        const sign = Math.sign(sample)
        const isHigh = sign === 1 || sign === 0
        const isLow = sign === -1 || sign === 0
        const sq = sample * sample

        if (isHigh) {
          peakHigh = Math.max(peakHigh, Math.sqrt(sq))
          rmsHigh.add(sq)
        }

        if (isLow) {
          peakLow = Math.max(peakLow, Math.sqrt(sq))
          rmsLow.add(sq)
        }
      }

      if (barElapsed > barRate) {
        barThen = now

        bars.unshift({
          peakHigh: peakHigh,
          peakLow: peakLow,
          rmsHigh: Math.sqrt(rmsHigh.calculate()),
          rmsLow: Math.sqrt(rmsLow.calculate()),
        })

        bars.pop()

        peakHigh = 0
        peakLow = 0
        rmsHigh.clear()
        rmsLow.clear()
      }

      for (i = 0; i < barCount; i++) {
        const bar = bars[i]

        if (!bar) {
          continue
        }

        const barWidth = canvas.width / 2 / bands

        const pos = flip
          ? canvas.width / 2 + barWidth * i
          : canvas.width / 2 - barWidth * (i + 1)

        drawBar(
          canvasCtx,
          barWidth,
          channelHeight,
          pos,
          offset,
          true,
          bar.rmsHigh,
          Math.max(bar.rmsHigh, bar.rmsLow)
        )

        drawBar(
          canvasCtx,
          barWidth,
          channelHeight,
          pos,
          offset,
          false,
          bar.rmsLow,
          Math.max(bar.rmsHigh, bar.rmsLow)
        )
      }
    }
  }

  return { createVisualizer }
})()
