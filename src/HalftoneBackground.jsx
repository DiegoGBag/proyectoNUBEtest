import { useEffect, useRef } from 'react'

// Halftone dot pattern: tiny dots at the top that grow towards the bottom.
function HalftoneBackground() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const parent = canvas.parentElement
    const context = canvas.getContext('2d')

    const draw = () => {
      const { width, height } = parent.getBoundingClientRect()
      const ratio = window.devicePixelRatio || 1
      canvas.width = width * ratio
      canvas.height = height * ratio
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.clearRect(0, 0, width, height)
      context.fillStyle = 'rgba(255, 255, 255, 0.9)'

      const spacing = 26
      const rows = Math.ceil(height / (spacing * 0.5)) + 1
      for (let row = 0; row < rows; row += 1) {
        const y = row * spacing * 0.5
        const progress = Math.min(y / height, 1)
        const radius = 0.8 + Math.pow(progress, 1.1) * (spacing * 0.46)
        const offset = row % 2 === 0 ? 0 : spacing / 2
        for (let x = -offset; x < width + spacing; x += spacing) {
          context.beginPath()
          context.arc(x + (row % 2 === 0 ? 0 : spacing / 2), y, radius, 0, Math.PI * 2)
          context.fill()
        }
      }
    }

    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(parent)
    return () => observer.disconnect()
  }, [])

  return <canvas ref={canvasRef} className="halftone-canvas" aria-hidden="true" />
}

export default HalftoneBackground
