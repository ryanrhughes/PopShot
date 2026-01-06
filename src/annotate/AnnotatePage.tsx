import { useState, useEffect, useRef, useCallback } from 'react'
import { Canvas, FabricImage, Line, Rect, IText, Circle, PencilBrush } from 'fabric'
import type { TPointerEventInfo, TPointerEvent } from 'fabric'
import { BoardSelector } from '../popup/components/BoardSelector'
import { getApiKey } from '@/lib/storage'
import { formatMetadataAsHtml, generateDefaultTitle, type PageMetadata } from '@/lib/metadata'
import { uploadImageAndCreateCard } from '@/lib/fizzy-api'

type AnnotationTool = 'select' | 'arrow' | 'rectangle' | 'circle' | 'text' | 'freehand'
type AppState = 'loading' | 'annotating' | 'submitting' | 'success' | 'error'

interface SessionData {
  imageDataUrl: string
  metadata: PageMetadata
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

const STROKE_WIDTHS = [2, 4, 6, 8]

export function AnnotatePage() {
  const [state, setState] = useState<AppState>('loading')
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<PageMetadata | null>(null)
  const [currentTool, setCurrentTool] = useState<AnnotationTool>('arrow')
  const [currentColor, setCurrentColor] = useState('#ef4444')
  const [strokeWidth, setStrokeWidth] = useState(4)
  const [isDrawing, setIsDrawing] = useState(false)
  const [selectedBoard, setSelectedBoard] = useState<{ slug: string; id: string; name: string } | null>(null)
  const [cardTitle, setCardTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cardUrl, setCardUrl] = useState<string | null>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 })
  
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fabricRef = useRef<Canvas | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const drawingStartRef = useRef<{ x: number; y: number } | null>(null)
  const currentShapeRef = useRef<Line | Rect | Circle | null>(null)
  const historyRef = useRef<string[]>([])
  const historyIndexRef = useRef(-1)

  // Load session data on mount
  useEffect(() => {
    loadSessionData()
  }, [])

  const loadSessionData = async () => {
    try {
      const result = await chrome.storage.session.get(['annotationSession'])
      const session: SessionData | undefined = result.annotationSession
      
      if (!session) {
        setError('No screenshot data found. Please capture a new screenshot.')
        setState('error')
        return
      }

      setImageDataUrl(session.imageDataUrl)
      setMetadata(session.metadata)
      setCardTitle(generateDefaultTitle(session.metadata))
      setState('annotating')
    } catch (err) {
      console.error('Failed to load session:', err)
      setError('Failed to load screenshot data.')
      setState('error')
    }
  }

  // Calculate canvas size based on image and container
  useEffect(() => {
    if (!imageDataUrl || !containerRef.current) return

    const img = new Image()
    img.onload = () => {
      const container = containerRef.current!
      const containerWidth = container.clientWidth - 48 // padding
      const containerHeight = window.innerHeight - 200 // leave room for toolbar and submit

      const scale = Math.min(
        containerWidth / img.width,
        containerHeight / img.height,
        1 // Don't scale up
      )

      setCanvasSize({
        width: Math.floor(img.width * scale),
        height: Math.floor(img.height * scale),
      })
    }
    img.src = imageDataUrl
  }, [imageDataUrl])

  // Initialize canvas
  useEffect(() => {
    if (!canvasRef.current || !imageDataUrl || state !== 'annotating') return

    const canvas = new Canvas(canvasRef.current, {
      width: canvasSize.width,
      height: canvasSize.height,
      backgroundColor: '#1a1a2e',
      selection: currentTool === 'select',
    })

    fabricRef.current = canvas

    // Load background image
    FabricImage.fromURL(imageDataUrl).then((img) => {
      if (!fabricRef.current) return

      const scale = Math.min(
        canvasSize.width / (img.width || 1),
        canvasSize.height / (img.height || 1)
      )

      img.scale(scale)
      img.set({
        left: (canvasSize.width - (img.width || 0) * scale) / 2,
        top: (canvasSize.height - (img.height || 0) * scale) / 2,
        selectable: false,
        evented: false,
      })

      fabricRef.current.backgroundImage = img
      fabricRef.current.renderAll()
      saveHistory()
    })

    return () => {
      canvas.dispose()
      fabricRef.current = null
    }
  }, [imageDataUrl, canvasSize, state])

  // Update canvas mode when tool changes
  useEffect(() => {
    if (!fabricRef.current) return
    
    const canvas = fabricRef.current
    canvas.selection = currentTool === 'select'
    canvas.isDrawingMode = currentTool === 'freehand'
    
    if (currentTool === 'freehand') {
      canvas.freeDrawingBrush = new PencilBrush(canvas)
      canvas.freeDrawingBrush.color = currentColor
      canvas.freeDrawingBrush.width = strokeWidth
    }
    
    canvas.forEachObject((obj) => {
      obj.selectable = currentTool === 'select'
      obj.evented = currentTool === 'select'
    })
    canvas.renderAll()
  }, [currentTool, currentColor, strokeWidth])

  // Save history
  const saveHistory = useCallback(() => {
    if (!fabricRef.current) return
    const json = JSON.stringify(fabricRef.current.toJSON())
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1)
    historyRef.current.push(json)
    historyIndexRef.current = historyRef.current.length - 1
  }, [])

  // Undo
  const handleUndo = useCallback(() => {
    if (historyIndexRef.current <= 0 || !fabricRef.current) return
    historyIndexRef.current--
    fabricRef.current.loadFromJSON(JSON.parse(historyRef.current[historyIndexRef.current])).then(() => {
      fabricRef.current?.renderAll()
    })
  }, [])

  // Redo
  const handleRedo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1 || !fabricRef.current) return
    historyIndexRef.current++
    fabricRef.current.loadFromJSON(JSON.parse(historyRef.current[historyIndexRef.current])).then(() => {
      fabricRef.current?.renderAll()
    })
  }, [])

  // Clear
  const handleClear = useCallback(() => {
    if (!fabricRef.current) return
    const bg = fabricRef.current.backgroundImage
    fabricRef.current.clear()
    if (bg) fabricRef.current.backgroundImage = bg
    fabricRef.current.renderAll()
    saveHistory()
  }, [saveHistory])

  // Delete selected
  const handleDelete = useCallback(() => {
    if (!fabricRef.current) return
    const activeObjects = fabricRef.current.getActiveObjects()
    activeObjects.forEach((obj) => fabricRef.current?.remove(obj))
    fabricRef.current.discardActiveObject()
    fabricRef.current.renderAll()
    saveHistory()
  }, [saveHistory])

  // Mouse handlers
  const handleMouseDown = useCallback((opt: TPointerEventInfo<TPointerEvent>) => {
    if (currentTool === 'select' || currentTool === 'freehand' || !fabricRef.current) return

    const pointer = fabricRef.current.getScenePoint(opt.e)
    drawingStartRef.current = { x: pointer.x, y: pointer.y }
    setIsDrawing(true)

    if (currentTool === 'arrow') {
      const line = new Line([pointer.x, pointer.y, pointer.x, pointer.y], {
        stroke: currentColor,
        strokeWidth: strokeWidth,
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
        strokeWidth: strokeWidth,
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
        strokeWidth: strokeWidth,
        selectable: false,
      })
      fabricRef.current.add(circle)
      currentShapeRef.current = circle
    } else if (currentTool === 'text') {
      const text = new IText('Type here', {
        left: pointer.x,
        top: pointer.y,
        fontSize: 24,
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
  }, [currentTool, currentColor, strokeWidth, saveHistory])

  const handleMouseMove = useCallback((opt: TPointerEventInfo<TPointerEvent>) => {
    if (!isDrawing || !drawingStartRef.current || !fabricRef.current || !currentShapeRef.current) return

    const pointer = fabricRef.current.getScenePoint(opt.e)
    const startX = drawingStartRef.current.x
    const startY = drawingStartRef.current.y

    if (currentTool === 'arrow' && currentShapeRef.current instanceof Line) {
      currentShapeRef.current.set({ x2: pointer.x, y2: pointer.y })
    } else if (currentTool === 'rectangle' && currentShapeRef.current instanceof Rect) {
      currentShapeRef.current.set({
        left: Math.min(startX, pointer.x),
        top: Math.min(startY, pointer.y),
        width: Math.abs(pointer.x - startX),
        height: Math.abs(pointer.y - startY),
      })
    } else if (currentTool === 'circle' && currentShapeRef.current instanceof Circle) {
      const radius = Math.sqrt(Math.pow(pointer.x - startX, 2) + Math.pow(pointer.y - startY, 2)) / 2
      currentShapeRef.current.set({
        left: (startX + pointer.x) / 2 - radius,
        top: (startY + pointer.y) / 2 - radius,
        radius,
      })
    }

    fabricRef.current.renderAll()
  }, [isDrawing, currentTool])

  const handleMouseUp = useCallback(() => {
    if (!isDrawing) return

    // Add arrowhead
    if (currentTool === 'arrow' && currentShapeRef.current instanceof Line && fabricRef.current) {
      const line = currentShapeRef.current
      const x1 = line.x1 || 0, y1 = line.y1 || 0, x2 = line.x2 || 0, y2 = line.y2 || 0
      const angle = Math.atan2(y2 - y1, x2 - x1)
      const headLength = 12 + strokeWidth * 2

      fabricRef.current.add(new Line([
        x2, y2,
        x2 - headLength * Math.cos(angle - Math.PI / 6),
        y2 - headLength * Math.sin(angle - Math.PI / 6),
      ], { stroke: currentColor, strokeWidth: strokeWidth, selectable: false }))

      fabricRef.current.add(new Line([
        x2, y2,
        x2 - headLength * Math.cos(angle + Math.PI / 6),
        y2 - headLength * Math.sin(angle + Math.PI / 6),
      ], { stroke: currentColor, strokeWidth: strokeWidth, selectable: false }))
    }

    setIsDrawing(false)
    drawingStartRef.current = null
    currentShapeRef.current = null
    saveHistory()
  }, [isDrawing, currentTool, currentColor, strokeWidth, saveHistory])

  // Set up canvas events
  useEffect(() => {
    if (!fabricRef.current) return
    const canvas = fabricRef.current
    canvas.on('mouse:down', handleMouseDown)
    canvas.on('mouse:move', handleMouseMove)
    canvas.on('mouse:up', handleMouseUp)
    canvas.on('path:created', saveHistory)
    return () => {
      canvas.off('mouse:down', handleMouseDown)
      canvas.off('mouse:move', handleMouseMove)
      canvas.off('mouse:up', handleMouseUp)
      canvas.off('path:created', saveHistory)
    }
  }, [handleMouseDown, handleMouseMove, handleMouseUp, saveHistory])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        if (e.shiftKey) handleRedo()
        else handleUndo()
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        handleDelete()
      }
      if (e.key === 'v') setCurrentTool('select')
      if (e.key === 'a') setCurrentTool('arrow')
      if (e.key === 'r') setCurrentTool('rectangle')
      if (e.key === 'c') setCurrentTool('circle')
      if (e.key === 't') setCurrentTool('text')
      if (e.key === 'p') setCurrentTool('freehand')
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleUndo, handleRedo, handleDelete])

  // Submit
  const handleSubmit = async () => {
    if (!fabricRef.current || !selectedBoard || !metadata) return

    setState('submitting')
    setError(null)

    try {
      const apiKey = await getApiKey()
      if (!apiKey) throw new Error('No API key found')

      const annotatedImage = fabricRef.current.toDataURL({ format: 'png', quality: 1, multiplier: 2 })
      const metadataHtml = formatMetadataAsHtml(metadata)

      const result = await uploadImageAndCreateCard(
        apiKey,
        selectedBoard.slug,
        selectedBoard.id,
        annotatedImage,
        cardTitle || generateDefaultTitle(metadata),
        metadataHtml
      )

      // Clear session data
      await chrome.storage.session.remove(['annotationSession'])
      
      setCardUrl(result.cardUrl)
      setState('success')
    } catch (err) {
      console.error('Submit error:', err)
      setError(err instanceof Error ? err.message : 'Failed to create card')
      setState('error')
    }
  }

  const handleCancel = async () => {
    await chrome.storage.session.remove(['annotationSession'])
    window.close()
  }

  // Render
  if (state === 'loading') {
    return (
      <div className="page loading-page">
        <div className="spinner" />
        <p>Loading screenshot...</p>
      </div>
    )
  }

  if (state === 'success') {
    return (
      <div className="page success-page">
        <div className="success-content">
          <div className="success-icon"><CheckIcon /></div>
          <h1>Feedback Submitted!</h1>
          <p>Your card has been created in Fizzy.</p>
          {cardUrl && (
            <a href={cardUrl} target="_blank" rel="noopener noreferrer" className="view-link">
              View Card in Fizzy
            </a>
          )}
          <button className="primary-btn" onClick={() => window.close()}>
            Close
          </button>
        </div>
      </div>
    )
  }

  if (state === 'error' && !imageDataUrl) {
    return (
      <div className="page error-page">
        <div className="error-content">
          <div className="error-icon"><ErrorIcon /></div>
          <h1>Something went wrong</h1>
          <p>{error}</p>
          <button className="primary-btn" onClick={() => window.close()}>
            Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page annotate-page">
      {/* Header */}
      <header className="page-header">
        <h1>Annotate Screenshot</h1>
        <div className="header-actions">
          <button className="secondary-btn" onClick={handleCancel}>Cancel</button>
        </div>
      </header>

      {/* Main content */}
      <div className="page-content" ref={containerRef}>
        {/* Toolbar */}
        <div className="toolbar">
          <div className="tool-section">
            <span className="section-label">Tools</span>
            <div className="tool-group">
              <button className={`tool-btn ${currentTool === 'select' ? 'active' : ''}`} onClick={() => setCurrentTool('select')} title="Select (V)">
                <SelectIcon />
              </button>
              <button className={`tool-btn ${currentTool === 'arrow' ? 'active' : ''}`} onClick={() => setCurrentTool('arrow')} title="Arrow (A)">
                <ArrowIcon />
              </button>
              <button className={`tool-btn ${currentTool === 'rectangle' ? 'active' : ''}`} onClick={() => setCurrentTool('rectangle')} title="Rectangle (R)">
                <RectIcon />
              </button>
              <button className={`tool-btn ${currentTool === 'circle' ? 'active' : ''}`} onClick={() => setCurrentTool('circle')} title="Circle (C)">
                <CircleIcon />
              </button>
              <button className={`tool-btn ${currentTool === 'text' ? 'active' : ''}`} onClick={() => setCurrentTool('text')} title="Text (T)">
                <TextIcon />
              </button>
              <button className={`tool-btn ${currentTool === 'freehand' ? 'active' : ''}`} onClick={() => setCurrentTool('freehand')} title="Freehand (P)">
                <PenIcon />
              </button>
            </div>
          </div>

          <div className="tool-section">
            <span className="section-label">Color</span>
            <div className="color-picker">
              {COLORS.map((color) => (
                <button
                  key={color}
                  className={`color-btn ${currentColor === color ? 'active' : ''}`}
                  style={{ backgroundColor: color, borderColor: color === '#ffffff' ? '#ccc' : color }}
                  onClick={() => setCurrentColor(color)}
                />
              ))}
            </div>
          </div>

          <div className="tool-section">
            <span className="section-label">Size</span>
            <div className="stroke-picker">
              {STROKE_WIDTHS.map((width) => (
                <button
                  key={width}
                  className={`stroke-btn ${strokeWidth === width ? 'active' : ''}`}
                  onClick={() => setStrokeWidth(width)}
                >
                  <span style={{ width: width * 2, height: width * 2, backgroundColor: currentColor, borderRadius: '50%' }} />
                </button>
              ))}
            </div>
          </div>

          <div className="tool-section">
            <span className="section-label">Actions</span>
            <div className="tool-group">
              <button className="tool-btn" onClick={handleUndo} title="Undo (Ctrl+Z)"><UndoIcon /></button>
              <button className="tool-btn" onClick={handleRedo} title="Redo (Ctrl+Shift+Z)"><RedoIcon /></button>
              <button className="tool-btn" onClick={handleDelete} title="Delete (Del)"><DeleteIcon /></button>
              <button className="tool-btn danger" onClick={handleClear} title="Clear All"><ClearIcon /></button>
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div className="canvas-wrapper">
          <canvas ref={canvasRef} />
        </div>

        {/* Submit panel */}
        <div className="submit-panel">
          {state === 'error' && error && (
            <div className="error-message">{error}</div>
          )}
          
          <div className="submit-row">
            <div className="form-group title-group">
              <label htmlFor="card-title">Title</label>
              <input
                type="text"
                id="card-title"
                value={cardTitle}
                onChange={(e) => setCardTitle(e.target.value)}
                placeholder="Feedback title"
                disabled={state === 'submitting'}
              />
            </div>

            <div className="form-group board-group">
              <BoardSelector
                currentUrl={metadata?.url}
                onSelect={(slug, id, name) => setSelectedBoard({ slug, id, name })}
                disabled={state === 'submitting'}
              />
            </div>

            <button
              className="submit-btn"
              onClick={handleSubmit}
              disabled={state === 'submitting' || !selectedBoard}
            >
              {state === 'submitting' ? (
                <>
                  <span className="spinner-small" />
                  Submitting...
                </>
              ) : (
                <>
                  <SendIcon />
                  Submit to Fizzy
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Icons
function SelectIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" /></svg>
}
function ArrowIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
}
function RectIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>
}
function CircleIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /></svg>
}
function TextIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" /></svg>
}
function PenIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l7.586 7.586" /><circle cx="11" cy="11" r="2" /></svg>
}
function UndoIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7v6h6" /><path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13" /></svg>
}
function RedoIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 7v6h-6" /><path d="M3 17a9 9 0 019-9 9 9 0 016 2.3l3 2.7" /></svg>
}
function DeleteIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
}
function ClearIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>
}
function SendIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
}
function CheckIcon() {
  return <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
}
function ErrorIcon() {
  return <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
}
