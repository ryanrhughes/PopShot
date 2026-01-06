import { useEffect, useRef, useState, useCallback } from 'react'
import { Canvas, FabricImage, Line, Rect, IText, Circle } from 'fabric'
import type { TPointerEventInfo, TPointerEvent } from 'fabric'

export type AnnotationTool = 'select' | 'arrow' | 'rectangle' | 'circle' | 'text' | 'freehand'

interface AnnotationCanvasProps {
  imageDataUrl: string
  onExport: (dataUrl: string) => void
  width?: number
  height?: number
}

interface HistoryState {
  json: string
}

const COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#000000', // black
  '#ffffff', // white
]

export function AnnotationCanvas({ 
  imageDataUrl, 
  onExport,
  width = 600,
  height = 400 
}: AnnotationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fabricRef = useRef<Canvas | null>(null)
  const [currentTool, setCurrentTool] = useState<AnnotationTool>('select')
  const [currentColor, setCurrentColor] = useState('#ef4444')
  const [isDrawing, setIsDrawing] = useState(false)
  const [history, setHistory] = useState<HistoryState[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const drawingStartRef = useRef<{ x: number; y: number } | null>(null)
  const currentShapeRef = useRef<Line | Rect | Circle | null>(null)

  // Initialize canvas
  useEffect(() => {
    if (!canvasRef.current) return

    const canvas = new Canvas(canvasRef.current, {
      width,
      height,
      backgroundColor: '#f0f0f0',
      selection: currentTool === 'select',
    })
    
    fabricRef.current = canvas

    // Load background image
    FabricImage.fromURL(imageDataUrl).then((img) => {
      if (!fabricRef.current) return
      
      // Scale image to fit canvas
      const scale = Math.min(
        width / (img.width || 1),
        height / (img.height || 1)
      )
      
      img.scale(scale)
      img.set({
        left: (width - (img.width || 0) * scale) / 2,
        top: (height - (img.height || 0) * scale) / 2,
        selectable: false,
        evented: false,
      })
      
      fabricRef.current.backgroundImage = img
      fabricRef.current.renderAll()
      
      // Save initial state
      saveHistory()
    })

    return () => {
      canvas.dispose()
      fabricRef.current = null
    }
  }, [imageDataUrl, width, height])

  // Update canvas selection mode when tool changes
  useEffect(() => {
    if (!fabricRef.current) return
    fabricRef.current.selection = currentTool === 'select'
    fabricRef.current.forEachObject((obj) => {
      obj.selectable = currentTool === 'select'
      obj.evented = currentTool === 'select'
    })
    fabricRef.current.renderAll()
  }, [currentTool])

  // Save history state
  const saveHistory = useCallback(() => {
    if (!fabricRef.current) return
    
    const json = JSON.stringify(fabricRef.current.toJSON())
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1)
      return [...newHistory, { json }]
    })
    setHistoryIndex(prev => prev + 1)
  }, [historyIndex])

  // Undo
  const handleUndo = useCallback(() => {
    if (historyIndex <= 0 || !fabricRef.current) return
    
    const newIndex = historyIndex - 1
    const state = history[newIndex]
    
    fabricRef.current.loadFromJSON(JSON.parse(state.json)).then(() => {
      fabricRef.current?.renderAll()
      setHistoryIndex(newIndex)
    })
  }, [history, historyIndex])

  // Redo
  const handleRedo = useCallback(() => {
    if (historyIndex >= history.length - 1 || !fabricRef.current) return
    
    const newIndex = historyIndex + 1
    const state = history[newIndex]
    
    fabricRef.current.loadFromJSON(JSON.parse(state.json)).then(() => {
      fabricRef.current?.renderAll()
      setHistoryIndex(newIndex)
    })
  }, [history, historyIndex])

  // Clear all annotations
  const handleClear = useCallback(() => {
    if (!fabricRef.current) return
    
    // Keep background, remove everything else
    const bg = fabricRef.current.backgroundImage
    fabricRef.current.clear()
    if (bg) {
      fabricRef.current.backgroundImage = bg
    }
    fabricRef.current.renderAll()
    saveHistory()
  }, [saveHistory])

  // Export canvas as data URL
  const handleExport = useCallback(() => {
    if (!fabricRef.current) return
    
    const dataUrl = fabricRef.current.toDataURL({
      format: 'png',
      quality: 1,
      multiplier: 2, // Higher resolution export
    })
    
    onExport(dataUrl)
  }, [onExport])

  // Mouse down handler
  const handleMouseDown = useCallback((opt: TPointerEventInfo<TPointerEvent>) => {
    if (currentTool === 'select' || !fabricRef.current) return
    
    const pointer = fabricRef.current.getScenePoint(opt.e)
    drawingStartRef.current = { x: pointer.x, y: pointer.y }
    setIsDrawing(true)

    if (currentTool === 'arrow') {
      const line = new Line([pointer.x, pointer.y, pointer.x, pointer.y], {
        stroke: currentColor,
        strokeWidth: 3,
        selectable: false,
      })
      fabricRef.current.add(line)
      currentShapeRef.current = line
    } else if (currentTool === 'rectangle') {
      const rect = new Rect({
        left: pointer.x,
        top: pointer.y,
        width: 0,
        height: 0,
        fill: 'transparent',
        stroke: currentColor,
        strokeWidth: 3,
        selectable: false,
      })
      fabricRef.current.add(rect)
      currentShapeRef.current = rect
    } else if (currentTool === 'circle') {
      const circle = new Circle({
        left: pointer.x,
        top: pointer.y,
        radius: 0,
        fill: 'transparent',
        stroke: currentColor,
        strokeWidth: 3,
        selectable: false,
      })
      fabricRef.current.add(circle)
      currentShapeRef.current = circle
    } else if (currentTool === 'text') {
      const text = new IText('Click to edit', {
        left: pointer.x,
        top: pointer.y,
        fontSize: 18,
        fill: currentColor,
        fontFamily: 'Arial',
      })
      fabricRef.current.add(text)
      fabricRef.current.setActiveObject(text)
      text.enterEditing()
      text.selectAll()
      setCurrentTool('select')
      saveHistory()
    }
  }, [currentTool, currentColor, saveHistory])

  // Mouse move handler
  const handleMouseMove = useCallback((opt: TPointerEventInfo<TPointerEvent>) => {
    if (!isDrawing || !drawingStartRef.current || !fabricRef.current || !currentShapeRef.current) return
    
    const pointer = fabricRef.current.getScenePoint(opt.e)
    const startX = drawingStartRef.current.x
    const startY = drawingStartRef.current.y

    if (currentTool === 'arrow' && currentShapeRef.current instanceof Line) {
      currentShapeRef.current.set({
        x2: pointer.x,
        y2: pointer.y,
      })
    } else if (currentTool === 'rectangle' && currentShapeRef.current instanceof Rect) {
      const width = Math.abs(pointer.x - startX)
      const height = Math.abs(pointer.y - startY)
      currentShapeRef.current.set({
        left: Math.min(startX, pointer.x),
        top: Math.min(startY, pointer.y),
        width,
        height,
      })
    } else if (currentTool === 'circle' && currentShapeRef.current instanceof Circle) {
      const radius = Math.sqrt(
        Math.pow(pointer.x - startX, 2) + Math.pow(pointer.y - startY, 2)
      ) / 2
      currentShapeRef.current.set({
        left: (startX + pointer.x) / 2 - radius,
        top: (startY + pointer.y) / 2 - radius,
        radius,
      })
    }

    fabricRef.current.renderAll()
  }, [isDrawing, currentTool])

  // Mouse up handler
  const handleMouseUp = useCallback(() => {
    if (!isDrawing) return
    
    setIsDrawing(false)
    drawingStartRef.current = null
    
    // Add arrowhead for arrow tool
    if (currentTool === 'arrow' && currentShapeRef.current instanceof Line && fabricRef.current) {
      const line = currentShapeRef.current
      const x1 = line.x1 || 0
      const y1 = line.y1 || 0
      const x2 = line.x2 || 0
      const y2 = line.y2 || 0
      
      // Calculate arrowhead
      const angle = Math.atan2(y2 - y1, x2 - x1)
      const headLength = 15
      
      const arrowHead1 = new Line([
        x2,
        y2,
        x2 - headLength * Math.cos(angle - Math.PI / 6),
        y2 - headLength * Math.sin(angle - Math.PI / 6),
      ], {
        stroke: currentColor,
        strokeWidth: 3,
        selectable: false,
      })
      
      const arrowHead2 = new Line([
        x2,
        y2,
        x2 - headLength * Math.cos(angle + Math.PI / 6),
        y2 - headLength * Math.sin(angle + Math.PI / 6),
      ], {
        stroke: currentColor,
        strokeWidth: 3,
        selectable: false,
      })
      
      fabricRef.current.add(arrowHead1)
      fabricRef.current.add(arrowHead2)
    }
    
    currentShapeRef.current = null
    saveHistory()
  }, [isDrawing, currentTool, currentColor, saveHistory])

  // Set up event handlers
  useEffect(() => {
    if (!fabricRef.current) return
    
    const canvas = fabricRef.current
    canvas.on('mouse:down', handleMouseDown)
    canvas.on('mouse:move', handleMouseMove)
    canvas.on('mouse:up', handleMouseUp)
    
    return () => {
      canvas.off('mouse:down', handleMouseDown)
      canvas.off('mouse:move', handleMouseMove)
      canvas.off('mouse:up', handleMouseUp)
    }
  }, [handleMouseDown, handleMouseMove, handleMouseUp])

  return (
    <div className="annotation-canvas">
      {/* Toolbar */}
      <div className="toolbar">
        <div className="tool-group">
          <button
            className={`tool-btn ${currentTool === 'select' ? 'active' : ''}`}
            onClick={() => setCurrentTool('select')}
            title="Select"
          >
            <SelectIcon />
          </button>
          <button
            className={`tool-btn ${currentTool === 'arrow' ? 'active' : ''}`}
            onClick={() => setCurrentTool('arrow')}
            title="Arrow"
          >
            <ArrowIcon />
          </button>
          <button
            className={`tool-btn ${currentTool === 'rectangle' ? 'active' : ''}`}
            onClick={() => setCurrentTool('rectangle')}
            title="Rectangle"
          >
            <RectIcon />
          </button>
          <button
            className={`tool-btn ${currentTool === 'circle' ? 'active' : ''}`}
            onClick={() => setCurrentTool('circle')}
            title="Circle"
          >
            <CircleIcon />
          </button>
          <button
            className={`tool-btn ${currentTool === 'text' ? 'active' : ''}`}
            onClick={() => setCurrentTool('text')}
            title="Text"
          >
            <TextIcon />
          </button>
        </div>

        <div className="color-picker">
          {COLORS.map((color) => (
            <button
              key={color}
              className={`color-btn ${currentColor === color ? 'active' : ''}`}
              style={{ backgroundColor: color }}
              onClick={() => setCurrentColor(color)}
              title={color}
            />
          ))}
        </div>

        <div className="tool-group">
          <button
            className="tool-btn"
            onClick={handleUndo}
            disabled={historyIndex <= 0}
            title="Undo"
          >
            <UndoIcon />
          </button>
          <button
            className="tool-btn"
            onClick={handleRedo}
            disabled={historyIndex >= history.length - 1}
            title="Redo"
          >
            <RedoIcon />
          </button>
          <button
            className="tool-btn"
            onClick={handleClear}
            title="Clear All"
          >
            <ClearIcon />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="canvas-container">
        <canvas ref={canvasRef} />
      </div>

      {/* Export button */}
      <div className="export-section">
        <button className="export-btn" onClick={handleExport}>
          Done Annotating
        </button>
      </div>
    </div>
  )
}

// Icon components
function SelectIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
    </svg>
  )
}

function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  )
}

function RectIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    </svg>
  )
}

function CircleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
    </svg>
  )
}

function TextIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  )
}

function UndoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13" />
    </svg>
  )
}

function RedoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 7v6h-6" />
      <path d="M3 17a9 9 0 019-9 9 9 0 016 2.3l3 2.7" />
    </svg>
  )
}

function ClearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  )
}
