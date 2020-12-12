window.modules = window.modules || {}

window.modules.draw = (function() {
  function drawAtFPS(fps, func) {
    const interval = 1000 / fps
    let then = Date.now()
    let stop = false

    function draw() {
      const now = Date.now()
      const elapsed = now - then

      if (!stop) {
        requestAnimationFrame(draw)
      } else {
        return
      }

      if (elapsed > interval) {
        then = now - (elapsed % interval)
        func()
      }
    }

    draw()

    return function() {
      stop = true
    }
  }

  return { drawAtFPS }
})()
