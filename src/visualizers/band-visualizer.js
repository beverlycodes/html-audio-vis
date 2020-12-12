window.modules = window.modules || {}
window.modules.visualizers = window.modules.visualizers || {}

window.modules.visualizers[
  'io.github.beverlycodes.visualizers.bands'
] = (function() {
  function createVisualizer(
    audioAnalyser,
    canvas,
    canvasCtx,
    { bands = 32, flip = false }
  ) {
    const sampleRate = audioAnalyser.context.sampleRate
    const frequencyBinCount = audioAnalyser.frequencyBinCount
    const frequencyArray = new Uint8Array(frequencyBinCount)

    const bandCount = Math.min(Math.min(frequencyBinCount, canvas.width), bands)

    const peakArray = new Uint8Array(bandCount)
    const rmsArray = new Uint8Array(bandCount)

    const filteredBins = [
      Math.floor(20 / (sampleRate / 2 / frequencyBinCount)),
      Math.ceil(20000 / (sampleRate / 2 / frequencyBinCount)),
    ]

    const filteredBinCount = filteredBins[1] - filteredBins[0]
    const binsPerBand = Math.max(1, Math.floor(filteredBinCount / bandCount))

    return function() {
      const channelHeight = canvas.height / 2
      let rms = 0
      let peak = 0

      audioAnalyser.getByteFrequencyData(frequencyArray)

      const barWidth = canvas.width / Math.min(bandCount, filteredBinCount)

      for (i = 0; i < filteredBinCount; i++) {
        const bucket = Math.floor(i / binsPerBand)
        const bin = i + filteredBins[0]

        peak = Math.max(frequencyArray[bin], peak)
        rms += frequencyArray[bin] * frequencyArray[bin]

        if ((i + 1) % binsPerBand === 0) {
          peakArray[bucket] = peak
          peak = 0

          rmsArray[bucket] = Math.sqrt(rms / binsPerBand)
          rms = 0
        }
      }

      for (i = 0; i < bandCount; i++) {
        const barPeakPercent = peakArray[i] / 255
        const barRMSPercent = rmsArray[i] / 255

        canvasCtx.fillStyle = `rgb(${Math.min(
          255 * barPeakPercent + 100,
          255
        )},100,25)`
        canvasCtx.fillRect(
          barWidth * i + (barWidth > 2 ? 1 : 0),
          canvas.height / 2 - (flip ? 0 : channelHeight * barPeakPercent),
          Math.max(1, barWidth - 2),
          channelHeight * barPeakPercent
        )

        canvasCtx.fillStyle = `rgb(50,${Math.min(
          255 * barRMSPercent + 100,
          255
        )},50)`
        canvasCtx.fillRect(
          barWidth * i + (barWidth > 2 ? 1 : 0),
          canvas.height / 2 - (flip ? 0 : channelHeight * barRMSPercent),
          Math.max(1, barWidth - 2),
          channelHeight * barRMSPercent
        )
      }
    }
  }

  return { createVisualizer }
})()
