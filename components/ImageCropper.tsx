'use client'
import { useState, useEffect, useRef } from 'react'

interface Props {
  src: string
  onConfirm: (base64: string, mime: string) => void
  onCancel: () => void
}

const SIZE = 320

export default function ImageCropper({ src, onConfirm, onCancel }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const imgRef     = useRef<HTMLImageElement | null>(null)
  const dragging   = useRef(false)
  const last       = useRef({ x: 0, y: 0 })
  const lastTouch  = useRef<{ x: number; y: number; dist?: number } | null>(null)

  const [zoom, setZoom]  = useState(1)
  const [off,  setOff]   = useState({ x: 0, y: 0 })

  // Draw helper — defined before effects
  function draw(z: number, o: { x: number; y: number }) {
    const canvas = canvasRef.current
    const img    = imgRef.current
    if (!canvas || !img) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, SIZE, SIZE)
    ctx.save()
    ctx.beginPath()
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2)
    ctx.clip()
    const scale = (SIZE / Math.min(img.width, img.height)) * z
    const w = img.width  * scale
    const h = img.height * scale
    const x = (SIZE - w) / 2 + o.x
    const y = (SIZE - h) / 2 + o.y
    ctx.drawImage(img, x, y, w, h)
    ctx.restore()
    ctx.beginPath()
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 1, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(204,20,20,0.7)'
    ctx.lineWidth = 2
    ctx.stroke()
  }

  useEffect(() => {
    const img = new Image()
    img.onload = () => { imgRef.current = img; draw(zoom, off) }
    img.src = src
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  useEffect(() => { draw(zoom, off) }, [zoom, off])

  function onMouseDown(e: React.MouseEvent) {
    dragging.current = true
    last.current = { x: e.clientX, y: e.clientY }
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!dragging.current) return
    const dx = e.clientX - last.current.x
    const dy = e.clientY - last.current.y
    last.current = { x: e.clientX, y: e.clientY }
    setOff(p => ({ x: p.x + dx, y: p.y + dy }))
  }
  function onMouseUp() { dragging.current = false }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault()
    setZoom(z => Math.min(5, Math.max(0.5, z - e.deltaY * 0.001)))
  }

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 1) {
      lastTouch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      lastTouch.current = { x: 0, y: 0, dist: Math.hypot(dx, dy) }
    }
  }
  function onTouchMove(e: React.TouchEvent) {
    e.preventDefault()
    if (e.touches.length === 1 && lastTouch.current) {
      const dx = e.touches[0].clientX - lastTouch.current.x
      const dy = e.touches[0].clientY - lastTouch.current.y
      lastTouch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      setOff(p => ({ x: p.x + dx, y: p.y + dy }))
    } else if (e.touches.length === 2 && lastTouch.current && lastTouch.current.dist !== undefined) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const newDist = Math.hypot(dx, dy)
      const delta = newDist - lastTouch.current.dist
      lastTouch.current.dist = newDist
      setZoom(z => Math.min(5, Math.max(0.5, z + delta * 0.005)))
    }
  }

  function handleConfirm() {
    const canvas = canvasRef.current
    if (!canvas) return
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
    const parts = dataUrl.split(',')
    onConfirm(parts[1], 'image/jpeg')
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#1a1a1a', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400, boxShadow: '0 30px 80px rgba(0,0,0,0.6)' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Editar foto</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 16 }}>Arraste para reposicionar &middot; Scroll ou pinca para zoom</div>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <canvas
            ref={canvasRef} width={SIZE} height={SIZE}
            style={{ borderRadius: '50%', cursor: 'grab', touchAction: 'none', userSelect: 'none', maxWidth: '100%' }}
            onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
            onWheel={onWheel}
            onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={() => { lastTouch.current = null }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', minWidth: 28 }}>- zoom</span>
          <input type="range" min={0.5} max={5} step={0.01} value={zoom}
            onChange={e => setZoom(Number(e.target.value))}
            style={{ flex: 1, accentColor: '#CC1414' } as React.CSSProperties} />
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', minWidth: 28 }}>+ zoom</span>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '10px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#fff' }}>Cancelar</button>
          <button onClick={() => { setZoom(1); setOff({ x: 0, y: 0 }) }} style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, cursor: 'pointer', fontSize: 12, color: 'rgba(255,255,255,0.6)' }} title="Resetar">Reset</button>
          <button onClick={handleConfirm} style={{ flex: 1, padding: '10px', background: '#CC1414', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>Usar foto</button>
        </div>
      </div>
    </div>
  )
}
