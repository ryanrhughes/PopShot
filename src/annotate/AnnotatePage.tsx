import { useState, useEffect, useRef, useCallback } from 'react'
import { Canvas, FabricImage, Line, Rect, IText, Ellipse, PencilBrush, Group, Polygon, Pattern, util } from 'fabric'
import type { TPointerEventInfo, TPointerEvent, FabricObject } from 'fabric'
import { BoardSelector } from '../popup/components/BoardSelector'
import { TagSelector } from './TagSelector'
import { getApiKey } from '@/lib/storage'
import { formatMetadataAsHtml, generateDefaultTitle, type PageMetadata } from '@/lib/metadata'
import { uploadImageAndCreateCard } from '@/lib/fizzy-api'

type AnnotationTool = 'select' | 'arrow' | 'rectangle' | 'ellipse' | 'text' | 'freehand' | 'pixelate' | 'crop'
type AppState = 'loading' | 'annotating' | 'submitting' | 'error'

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
  const [currentTool, setCurrentTool] = useState<AnnotationTool>('select')
  const [currentColor, setCurrentColor] = useState('#ef4444')
  const [strokeWidth, setStrokeWidth] = useState(4)
  const [isDrawing, setIsDrawing] = useState(false)
  const [selectedBoard, setSelectedBoard] = useState<{ slug: string; id: string; name: string } | null>(null)
  const [cardTitle, setCardTitle] = useState('')
  const [cardDescription, setCardDescription] = useState('')
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 })
  const [annotatedImageData, setAnnotatedImageData] = useState<string | null>(null)
  const [zoom, setZoom] = useState(100)
  const [baseScale, setBaseScale] = useState(1)
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [cropRegion, setCropRegion] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [isCropping, setIsCropping] = useState(false)
  const pendingObjectsRef = useRef<object[] | null>(null)
  const pendingCropInfoRef = useRef<{ width: number; height: number } | null>(null)
  const canvasInstanceIdRef = useRef(0) // Track canvas instance to detect recreation during async ops
  
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fabricRef = useRef<Canvas | null>(null)
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const drawingStartRef = useRef<{ x: number; y: number } | null>(null)
  const currentShapeRef = useRef<Line | Rect | Ellipse | Group | null>(null)
  const historyRef = useRef<{ canvasJson: string; imageDataUrl: string }[]>([])
  const historyIndexRef = useRef(-1)
  const isRestoringFromHistoryRef = useRef(false)
  const backgroundImageRef = useRef<HTMLImageElement | null>(null)
  const bgScaleRef = useRef<number>(1)
  const bgOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  // Pixelate a region from the background image and return as data URL
  const pixelateFromBackground = useCallback((left: number, top: number, width: number, height: number): string | null => {
    const bgImg = backgroundImageRef.current
    if (!bgImg || width < 1 || height < 1) return null

    const scale = bgScaleRef.current
    const offset = bgOffsetRef.current

    // Convert canvas coords to background image coords
    const srcX = (left - offset.x) / scale
    const srcY = (top - offset.y) / scale
    const srcW = width / scale
    const srcH = height / scale

    // Create canvas for the region
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = width
    tempCanvas.height = height
    const ctx = tempCanvas.getContext('2d')
    if (!ctx) return null

    // Draw the region from background
    ctx.drawImage(bgImg, srcX, srcY, srcW, srcH, 0, 0, width, height)

    // Pixelate by scaling down then up
    const pixelSize = 10
    const smallW = Math.max(1, Math.ceil(width / pixelSize))
    const smallH = Math.max(1, Math.ceil(height / pixelSize))

    const smallCanvas = document.createElement('canvas')
    smallCanvas.width = smallW
    smallCanvas.height = smallH
    const smallCtx = smallCanvas.getContext('2d')
    if (!smallCtx) return null

    // Draw small (this averages the pixels)
    smallCtx.drawImage(tempCanvas, 0, 0, smallW, smallH)

    // Draw back large without smoothing (pixelated)
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, width, height)
    ctx.drawImage(smallCanvas, 0, 0, width, height)

    return tempCanvas.toDataURL('image/png')
  }, [])

  // Update pixelate zone's fill with pixelated image
  const updatePixelateZone = useCallback((rect: Rect) => {
    const left = rect.left || 0
    const top = rect.top || 0
    const width = (rect.width || 0) * (rect.scaleX || 1)
    const height = (rect.height || 0) * (rect.scaleY || 1)

    const pixelatedDataUrl = pixelateFromBackground(left, top, width, height)
    if (!pixelatedDataUrl) return

    // Create an image and set it as pattern fill
    const img = new Image()
    img.onload = () => {
      rect.set({
        fill: new Pattern({
          source: img,
          repeat: 'no-repeat',
        }),
      })
      fabricRef.current?.renderAll()
    }
    img.src = pixelatedDataUrl
  }, [pixelateFromBackground])

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
    if (!imageDataUrl || !canvasContainerRef.current) return

    const img = new Image()
    img.onload = () => {
      const container = canvasContainerRef.current!
      const containerWidth = container.clientWidth - 32
      const containerHeight = container.clientHeight - 32

      // Store original image size
      setImageSize({ width: img.width, height: img.height })

      // Calculate scale to fit in container
      const scale = Math.min(
        containerWidth / img.width,
        containerHeight / img.height,
        1
      )
      
      setBaseScale(scale)
      setZoom(100)

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

    // Increment canvas instance ID to track this specific canvas
    canvasInstanceIdRef.current++
    const thisCanvasId = canvasInstanceIdRef.current
    
    // Capture pending objects before canvas recreation (they'll be restored after bg loads)
    const objectsToRestore = pendingObjectsRef.current
    const cropInfo = pendingCropInfoRef.current
    


    const canvas = new Canvas(canvasRef.current, {
      width: canvasSize.width,
      height: canvasSize.height,
      backgroundColor: '#1a1a2e',
      selection: currentTool === 'select',
      perPixelTargetFind: true,  // Allow clicking inside shapes to select them
      targetFindTolerance: 5,    // Add some tolerance for easier selection
    })

    fabricRef.current = canvas

    // Load background image
    FabricImage.fromURL(imageDataUrl).then((img) => {
      if (!fabricRef.current) return

      const scale = Math.min(
        canvasSize.width / (img.width || 1),
        canvasSize.height / (img.height || 1)
      )

      const offsetX = (canvasSize.width - (img.width || 0) * scale) / 2
      const offsetY = (canvasSize.height - (img.height || 0) * scale) / 2

      img.scale(scale)
      img.set({
        left: offsetX,
        top: offsetY,
        selectable: false,
        evented: false,
      })

      // Store background info for pixelation
      bgScaleRef.current = scale
      bgOffsetRef.current = { x: offsetX, y: offsetY }
      

      
      // Store the actual HTML image element
      const htmlImg = new Image()
      htmlImg.onload = () => {
        backgroundImageRef.current = htmlImg
      }
      htmlImg.src = imageDataUrl

      fabricRef.current.backgroundImage = img
      fabricRef.current.renderAll()
      
      // Always try to restore if we have pending objects
      // Every canvas recreation needs to restore because the previous canvas was disposed
      if (objectsToRestore && objectsToRestore.length > 0) {
        util.enlivenObjects(objectsToRestore).then((objects) => {
          // Check if canvas was recreated while we were enlivening objects
          if (canvasInstanceIdRef.current !== thisCanvasId || !fabricRef.current) return
          
          const newBgOffset = bgOffsetRef.current
          
          objects.forEach((obj, idx) => {
            if (!fabricRef.current || !obj || typeof obj !== 'object' || !('set' in obj)) return
            
            const fabObj = obj as FabricObject
            const originalData = objectsToRestore[idx] as { _relativeLeft?: number; _relativeTop?: number; _oldBgScale?: number }
            
            if (cropInfo && originalData._relativeLeft !== undefined && originalData._relativeTop !== undefined && originalData._oldBgScale) {
              const newBgWidth = (fabricRef.current.width || 0) - newBgOffset.x * 2
              const newBgHeight = (fabricRef.current.height || 0) - newBgOffset.y * 2
              const scaleRatio = bgScaleRef.current / originalData._oldBgScale
              
              const newLeft = originalData._relativeLeft * newBgWidth + newBgOffset.x
              const newTop = originalData._relativeTop * newBgHeight + newBgOffset.y
              
              fabObj.set({ 
                left: newLeft, 
                top: newTop,
                scaleX: (fabObj.scaleX || 1) * scaleRatio,
                scaleY: (fabObj.scaleY || 1) * scaleRatio,
              })
              fabObj.setCoords()
            }
            
            fabricRef.current!.add(fabObj)
          })
          
          fabricRef.current.renderAll()
          
          // Only save history once per crop (when we successfully restore to the final canvas)
          // We know we're on the final canvas if it's still the current one after a brief moment
          setTimeout(() => {
            if (canvasInstanceIdRef.current === thisCanvasId && pendingObjectsRef.current) {
              pendingObjectsRef.current = null
              pendingCropInfoRef.current = null
              saveHistory()
            }
          }, 200)
        }).catch(err => {
          console.error('[Crop] Failed to enliven objects:', err)
        })
      } else {
        // No objects to restore, just save history
        if (!isRestoringFromHistoryRef.current) {
          saveHistory()
        }
        isRestoringFromHistoryRef.current = false
      }
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
    if (!fabricRef.current || !imageDataUrl || isRestoringFromHistoryRef.current) return
    const json = JSON.stringify(fabricRef.current.toJSON())
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1)
    historyRef.current.push({ canvasJson: json, imageDataUrl })
    historyIndexRef.current = historyRef.current.length - 1
  }, [imageDataUrl])



  // Undo
  const handleUndo = useCallback(() => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current--
      const historyEntry = historyRef.current[historyIndexRef.current]
      
      // Check if we need to restore a different image (undo crop)
      if (historyEntry.imageDataUrl !== imageDataUrl) {
        isRestoringFromHistoryRef.current = true
        // Store the canvas state to restore after image changes
        pendingObjectsRef.current = JSON.parse(historyEntry.canvasJson).objects || []
        setImageDataUrl(historyEntry.imageDataUrl)
        setZoom(100)
      } else if (fabricRef.current) {
        // Same image, just restore canvas state
        fabricRef.current.loadFromJSON(JSON.parse(historyEntry.canvasJson)).then(() => {
          fabricRef.current?.renderAll()
        })
      }
    }
  }, [imageDataUrl])

  // Redo
  const handleRedo = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current++
      const historyEntry = historyRef.current[historyIndexRef.current]
      
      // Check if we need to restore a different image (redo crop)
      if (historyEntry.imageDataUrl !== imageDataUrl) {
        isRestoringFromHistoryRef.current = true
        pendingObjectsRef.current = JSON.parse(historyEntry.canvasJson).objects || []
        setImageDataUrl(historyEntry.imageDataUrl)
        setZoom(100)
      } else if (fabricRef.current) {
        fabricRef.current.loadFromJSON(JSON.parse(historyEntry.canvasJson)).then(() => {
          fabricRef.current?.renderAll()
        })
      }
    }
  }, [imageDataUrl])

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

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    setZoom(z => Math.min(z + 25, 200))
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoom(z => Math.max(z - 25, 50))
  }, [])

  const handleZoomReset = useCallback(() => {
    setZoom(100)
  }, [])

  // Apply crop - non-destructive, keeps annotations as objects
  const handleApplyCrop = useCallback(() => {
    if (!cropRegion || !fabricRef.current || !backgroundImageRef.current) return
    if (cropRegion.width < 10 || cropRegion.height < 10) {
      setCropRegion(null)
      setIsCropping(false)
      return
    }

    const canvas = fabricRef.current
    const bgImg = backgroundImageRef.current
    const scale = bgScaleRef.current
    const offset = bgOffsetRef.current

    // Convert crop region from canvas coords to original image coords
    const srcX = (cropRegion.x - offset.x) / scale
    const srcY = (cropRegion.y - offset.y) / scale
    const srcW = cropRegion.width / scale
    const srcH = cropRegion.height / scale

    // Crop the background image
    const cropCanvas = document.createElement('canvas')
    cropCanvas.width = srcW
    cropCanvas.height = srcH
    const ctx = cropCanvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(bgImg, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH)
    const croppedDataUrl = cropCanvas.toDataURL('image/png')

    // Save to history before making changes (with current image)
    saveHistory()

    // Calculate the scale ratio between old and new canvas
    // Old canvas had the background at bgScaleRef.current scale
    // New canvas will scale the cropped image to fit, which will be a different scale
    // We need to store the crop info so we can adjust positions when restoring
    
    const objects = canvas.getObjects()
    const shiftX = cropRegion.x
    const shiftY = cropRegion.y
    
    // Store the original positions relative to the crop region origin
    // These are in the current canvas coordinate system
    const objectsRelativeToCrop = objects.map(obj => ({
      obj,
      relLeft: (obj.left || 0) - shiftX,
      relTop: (obj.top || 0) - shiftY,
    }))
    
    // Serialize objects with adjusted positions and store scale info
    const adjustedObjects = objectsRelativeToCrop.map(({ obj, relLeft, relTop }) => {
      const objData = obj.toObject()
      // Store position as fraction of crop region (0-1 range plus overflow)
      objData._relativeLeft = relLeft / cropRegion.width
      objData._relativeTop = relTop / cropRegion.height
      // Store the old scale so we can calculate the scale ratio
      objData._oldBgScale = scale
      // Also store the original scale-adjusted position
      objData.left = relLeft
      objData.top = relTop
      return objData
    })
    
    // Store adjusted objects and crop dimensions for position calculation when restoring
    pendingObjectsRef.current = adjustedObjects
    pendingCropInfoRef.current = { width: cropRegion.width, height: cropRegion.height }
    
    // Update state - this will reinitialize the canvas with the cropped background
    setImageDataUrl(croppedDataUrl)

    // Reset crop state
    setCropRegion(null)
    setIsCropping(false)
    setCurrentTool('select')
    setZoom(100)
  }, [cropRegion, saveHistory])

  const handleCancelCrop = useCallback(() => {
    setCropRegion(null)
    setIsCropping(false)
    setCurrentTool('select')
  }, [])

  // Apply zoom to canvas
  useEffect(() => {
    if (!imageSize.width || !baseScale) return
    
    const effectiveScale = baseScale * (zoom / 100)
    setCanvasSize({
      width: Math.floor(imageSize.width * effectiveScale),
      height: Math.floor(imageSize.height * effectiveScale),
    })
  }, [zoom, baseScale, imageSize])

  // Create arrow with line and head as a group
  const createArrow = useCallback((x1: number, y1: number, x2: number, y2: number) => {
    const angle = Math.atan2(y2 - y1, x2 - x1)
    const headLength = 12 + strokeWidth * 2

    const line = new Line([x1, y1, x2, y2], {
      stroke: currentColor,
      strokeWidth: strokeWidth,
      originX: 'center',
      originY: 'center',
    })

    const headPoints = [
      { x: x2, y: y2 },
      { x: x2 - headLength * Math.cos(angle - Math.PI / 6), y: y2 - headLength * Math.sin(angle - Math.PI / 6) },
      { x: x2 - headLength * Math.cos(angle + Math.PI / 6), y: y2 - headLength * Math.sin(angle + Math.PI / 6) },
    ]

    const arrowHead = new Polygon(headPoints, {
      fill: currentColor,
      stroke: currentColor,
      strokeWidth: 1,
      originX: 'center',
      originY: 'center',
    })

    const group = new Group([line, arrowHead], {
      selectable: true,
    })

    return group
  }, [currentColor, strokeWidth])

  // Mouse handlers
  const handleMouseDown = useCallback((opt: TPointerEventInfo<TPointerEvent>) => {
    if (currentTool === 'select' || currentTool === 'freehand' || !fabricRef.current) return

    const pointer = fabricRef.current.getScenePoint(opt.e)
    drawingStartRef.current = { x: pointer.x, y: pointer.y }
    setIsDrawing(true)

    if (currentTool === 'crop') {
      setIsCropping(true)
      setCropRegion({ x: pointer.x, y: pointer.y, width: 0, height: 0 })
      return
    }

    if (currentTool === 'arrow') {
      // Create initial arrow group
      const arrow = createArrow(pointer.x, pointer.y, pointer.x + 1, pointer.y + 1)
      arrow.selectable = false
      fabricRef.current.add(arrow)
      currentShapeRef.current = arrow
    } else if (currentTool === 'rectangle') {
      const rect = new Rect({
        left: pointer.x,
        top: pointer.y,
        width: 0,
        height: 0,
        fill: 'rgba(0,0,0,0.01)', // Nearly invisible but clickable
        stroke: currentColor,
        strokeWidth: strokeWidth,
        selectable: false,
      })
      fabricRef.current.add(rect)
      currentShapeRef.current = rect
    } else if (currentTool === 'ellipse') {
      const ellipse = new Ellipse({
        left: pointer.x,
        top: pointer.y,
        rx: 0,
        ry: 0,
        fill: 'rgba(0,0,0,0.01)', // Nearly invisible but clickable
        stroke: currentColor,
        strokeWidth: strokeWidth,
        selectable: false,
      })
      fabricRef.current.add(ellipse)
      currentShapeRef.current = ellipse
    } else if (currentTool === 'pixelate') {
      // Pixelation zone - will show pixelated content
      const rect = new Rect({
        left: pointer.x,
        top: pointer.y,
        width: 0,
        height: 0,
        fill: 'transparent',
        stroke: 'transparent',
        selectable: false,
        objectCaching: false, // Disable caching so it updates on move
        perPixelTargetFind: false, // Use bounding box for selection (filled with pattern)
      })
      // @ts-expect-error custom property for pixelate zones
      rect.isPixelateZone = true
      fabricRef.current.add(rect)
      currentShapeRef.current = rect
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
  }, [currentTool, currentColor, strokeWidth, saveHistory, createArrow])

  const handleMouseMove = useCallback((opt: TPointerEventInfo<TPointerEvent>) => {
    if (!isDrawing || !drawingStartRef.current || !fabricRef.current) return

    const pointer = fabricRef.current.getScenePoint(opt.e)
    const startX = drawingStartRef.current.x
    const startY = drawingStartRef.current.y

    if (currentTool === 'crop') {
      setCropRegion({
        x: Math.min(startX, pointer.x),
        y: Math.min(startY, pointer.y),
        width: Math.abs(pointer.x - startX),
        height: Math.abs(pointer.y - startY),
      })
      return
    }

    if (!currentShapeRef.current) return

    if (currentTool === 'arrow' && currentShapeRef.current instanceof Group) {
      // Remove old arrow and create new one
      fabricRef.current.remove(currentShapeRef.current)
      const newArrow = createArrow(startX, startY, pointer.x, pointer.y)
      newArrow.selectable = false
      fabricRef.current.add(newArrow)
      currentShapeRef.current = newArrow
    } else if (currentTool === 'rectangle' && currentShapeRef.current instanceof Rect) {
      currentShapeRef.current.set({
        left: Math.min(startX, pointer.x),
        top: Math.min(startY, pointer.y),
        width: Math.abs(pointer.x - startX),
        height: Math.abs(pointer.y - startY),
      })
    } else if (currentTool === 'ellipse' && currentShapeRef.current instanceof Ellipse) {
      const rx = Math.abs(pointer.x - startX) / 2
      const ry = Math.abs(pointer.y - startY) / 2
      currentShapeRef.current.set({
        left: Math.min(startX, pointer.x),
        top: Math.min(startY, pointer.y),
        rx,
        ry,
      })
    } else if (currentTool === 'pixelate' && currentShapeRef.current instanceof Rect) {
      const newLeft = Math.min(startX, pointer.x)
      const newTop = Math.min(startY, pointer.y)
      const newWidth = Math.abs(pointer.x - startX)
      const newHeight = Math.abs(pointer.y - startY)
      
      currentShapeRef.current.set({
        left: newLeft,
        top: newTop,
        width: newWidth,
        height: newHeight,
      })
      
      // Update pixelation in real-time
      if (newWidth > 5 && newHeight > 5) {
        updatePixelateZone(currentShapeRef.current)
      }
    }

    fabricRef.current.renderAll()
  }, [isDrawing, currentTool, createArrow, updatePixelateZone])

  const handleMouseUp = useCallback(() => {
    if (!isDrawing || !fabricRef.current) return

    // For crop, don't reset - keep the selection visible for apply/cancel
    if (currentTool === 'crop') {
      setIsDrawing(false)
      drawingStartRef.current = null
      return
    }

    // Make shapes selectable after drawing
    if (currentShapeRef.current) {
      currentShapeRef.current.selectable = true
    }

    setIsDrawing(false)
    drawingStartRef.current = null
    currentShapeRef.current = null
    saveHistory()
  }, [isDrawing, saveHistory, currentTool])

  // Set up canvas events
  useEffect(() => {
    if (!fabricRef.current) return
    const canvas = fabricRef.current
    canvas.on('mouse:down', handleMouseDown)
    canvas.on('mouse:move', handleMouseMove)
    canvas.on('mouse:up', handleMouseUp)
    canvas.on('path:created', saveHistory)
    
    // Update pixelate zones when objects are modified (moved, scaled, etc)
    const handleObjectModified = (e: { target?: unknown }) => {
      const obj = e.target as Rect | undefined
      // @ts-expect-error custom property
      if (obj && obj.isPixelateZone && obj instanceof Rect) {
        updatePixelateZone(obj)
      }
    }
    
    canvas.on('object:modified', handleObjectModified)
    canvas.on('object:moving', handleObjectModified)
    canvas.on('object:scaling', handleObjectModified)
    
    return () => {
      canvas.off('mouse:down', handleMouseDown)
      canvas.off('mouse:move', handleMouseMove)
      canvas.off('mouse:up', handleMouseUp)
      canvas.off('path:created', saveHistory)
      canvas.off('object:modified', handleObjectModified)
      canvas.off('object:moving', handleObjectModified)
      canvas.off('object:scaling', handleObjectModified)
    }
  }, [handleMouseDown, handleMouseMove, handleMouseUp, saveHistory, updatePixelateZone])

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
      if (e.key === 'e') setCurrentTool('ellipse')
      if (e.key === 't') setCurrentTool('text')
      if (e.key === 'p') setCurrentTool('freehand')
      if (e.key === 'x') setCurrentTool('pixelate')
      if (e.key === 'c' && !e.ctrlKey && !e.metaKey) setCurrentTool('crop')
      if (e.key === 'Escape' && isCropping) {
        setCropRegion(null)
        setIsCropping(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleUndo, handleRedo, handleDelete, isCropping])

  // Submit - capture image data first, then submit
  const handleSubmit = async () => {
    if (!selectedBoard || !metadata) {
      setError('Please select a board')
      return
    }

    setState('submitting')

    // Capture the annotated image (pixelation already rendered)
    let imageData = annotatedImageData
    if (!imageData && fabricRef.current) {
      imageData = fabricRef.current.toDataURL({ format: 'png', quality: 1, multiplier: 2 })
      setAnnotatedImageData(imageData)
    }

    if (!imageData) {
      setError('Failed to capture annotated image')
      setState('annotating')
      return
    }
    setError(null)

    try {
      const apiKey = await getApiKey()
      if (!apiKey) throw new Error('No API key found')

      // Build description with user content and metadata
      const metadataHtml = formatMetadataAsHtml(metadata)
      let fullDescription = ''
      if (cardDescription.trim()) {
        // Escape HTML in user input and convert newlines to <br>
        const escapedDescription = cardDescription
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\n/g, '<br>')
        fullDescription = `<p>${escapedDescription}</p><hr>${metadataHtml}`
      } else {
        fullDescription = metadataHtml
      }

      const result = await uploadImageAndCreateCard(
        apiKey,
        selectedBoard.slug,
        selectedBoard.id,
        imageData,
        cardTitle || generateDefaultTitle(metadata),
        fullDescription,
        selectedTagIds.length > 0 ? selectedTagIds : undefined
      )

      // Clear session data
      await chrome.storage.session.remove(['annotationSession'])
      
      // Show notification and save to history
      await chrome.runtime.sendMessage({ 
        action: 'showSuccessNotification', 
        cardUrl: result.cardUrl,
        title: cardTitle,
      })
      
      // Close this tab
      window.close()
    } catch (err) {
      console.error('Submit error:', err)
      setError(err instanceof Error ? err.message : 'Failed to create card')
      setState('annotating') // Go back to annotating state so user can retry
    }
  }

  const handleCancel = async () => {
    await chrome.storage.session.remove(['annotationSession'])
    window.close()
  }

  // Render loading state
  if (state === 'loading') {
    return (
      <div className="page loading-page">
        <div className="spinner" />
        <p>Loading screenshot...</p>
      </div>
    )
  }

  // Render error state (no image)
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

  // Main annotate view
  return (
    <div className="page annotate-page">
      {/* Left: Canvas area */}
      <div className="canvas-area">
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
              <button className={`tool-btn ${currentTool === 'ellipse' ? 'active' : ''}`} onClick={() => setCurrentTool('ellipse')} title="Ellipse (E)">
                <EllipseIcon />
              </button>
              <button className={`tool-btn ${currentTool === 'text' ? 'active' : ''}`} onClick={() => setCurrentTool('text')} title="Text (T)">
                <TextIcon />
              </button>
              <button className={`tool-btn ${currentTool === 'freehand' ? 'active' : ''}`} onClick={() => setCurrentTool('freehand')} title="Freehand (P)">
                <PenIcon />
              </button>
              <button className={`tool-btn ${currentTool === 'pixelate' ? 'active' : ''}`} onClick={() => setCurrentTool('pixelate')} title="Pixelate (X)">
                <BlurIcon />
              </button>
              <button className={`tool-btn ${currentTool === 'crop' ? 'active' : ''}`} onClick={() => setCurrentTool('crop')} title="Crop (C)">
                <CropIcon />
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
        <div className={`canvas-container ${zoom > 100 ? 'zoomed' : ''}`} ref={canvasContainerRef}>
          <div className="canvas-wrapper">
            <canvas ref={canvasRef} />
            {/* Crop overlay */}
            {isCropping && cropRegion && cropRegion.width > 0 && cropRegion.height > 0 && (
              <>
                {/* Dark overlay outside crop region */}
                <div className="crop-overlay">
                  <div className="crop-mask-top" style={{ height: cropRegion.y }} />
                  <div className="crop-mask-middle" style={{ height: cropRegion.height }}>
                    <div className="crop-mask-left" style={{ width: cropRegion.x }} />
                    <div 
                      className="crop-selection" 
                      style={{ 
                        width: cropRegion.width, 
                        height: cropRegion.height,
                      }}
                    />
                    <div className="crop-mask-right" />
                  </div>
                  <div className="crop-mask-bottom" />
                </div>
                {/* Crop action buttons */}
                <div 
                  className="crop-actions"
                  style={{ 
                    left: cropRegion.x + cropRegion.width / 2,
                    top: cropRegion.y + cropRegion.height + 10,
                  }}
                >
                  <button className="crop-btn crop-cancel" onClick={handleCancelCrop} title="Cancel (Esc)">
                    <CancelCropIcon />
                  </button>
                  <button className="crop-btn crop-apply" onClick={handleApplyCrop} title="Apply Crop">
                    <ApplyCropIcon />
                  </button>
                </div>
              </>
            )}
          </div>
          <div className="zoom-controls">
            <button className="zoom-btn" onClick={handleZoomOut} title="Zoom Out">−</button>
            <button className="zoom-level" onClick={handleZoomReset} title="Reset Zoom">{zoom}%</button>
            <button className="zoom-btn" onClick={handleZoomIn} title="Zoom In">+</button>
          </div>
        </div>
      </div>

      {/* Right: Sidebar with form */}
      <div className="sidebar">
        <div className="sidebar-header">
          <h2>Submit Feedback</h2>
        </div>

        <div className="sidebar-content">
          {error && (
            <div className="error-message">{error}</div>
          )}

          <div className="form-group">
            <label htmlFor="card-title">Title *</label>
            <input
              type="text"
              id="card-title"
              value={cardTitle}
              onChange={(e) => setCardTitle(e.target.value)}
              placeholder="Brief summary of the feedback"
              disabled={state === 'submitting'}
            />
          </div>

          <div className="form-group">
            <label htmlFor="card-description">Description</label>
            <textarea
              id="card-description"
              value={cardDescription}
              onChange={(e) => setCardDescription(e.target.value)}
              placeholder="Add more details about this feedback..."
              rows={5}
              disabled={state === 'submitting'}
            />
          </div>

          <div className="form-group">
            <label>Tags</label>
            <TagSelector
              accountSlug={selectedBoard?.slug ?? null}
              selectedTagIds={selectedTagIds}
              onTagsChange={setSelectedTagIds}
              disabled={state === 'submitting'}
            />
          </div>

          <div className="form-group">
            <BoardSelector
              currentUrl={metadata?.url}
              onSelect={(slug, id, name) => {
                // Clear selected tags when board changes (tags are account-specific)
                if (selectedBoard?.slug !== slug) {
                  setSelectedTagIds([])
                }
                setSelectedBoard({ slug, id, name })
              }}
              disabled={state === 'submitting'}
            />
          </div>

          {metadata && (
            <div className="metadata-preview">
              <h4>Auto-captured Info</h4>
              <div className="metadata-item">
                <span className="label">URL:</span>
                <span className="value" title={metadata.url}>{metadata.url}</span>
              </div>
              <div className="metadata-item">
                <span className="label">Browser:</span>
                <span className="value">{metadata.browser} {metadata.browserVersion}</span>
              </div>
              <div className="metadata-item">
                <span className="label">Viewport:</span>
                <span className="value">{metadata.viewportWidth} x {metadata.viewportHeight}</span>
              </div>
            </div>
          )}
        </div>

        <div className="sidebar-footer">
          <button className="cancel-btn" onClick={handleCancel} disabled={state === 'submitting'}>
            Cancel
          </button>
          <button
            className="submit-btn"
            onClick={handleSubmit}
            disabled={state === 'submitting' || !selectedBoard || !cardTitle.trim()}
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
function EllipseIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="12" rx="10" ry="6" /></svg>
}
function BlurIcon() {
  // Pixelate icon - grid of squares
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <rect x="2" y="2" width="6" height="6" />
    <rect x="10" y="2" width="6" height="6" opacity="0.6" />
    <rect x="18" y="2" width="4" height="6" opacity="0.3" />
    <rect x="2" y="10" width="6" height="6" opacity="0.6" />
    <rect x="10" y="10" width="6" height="6" />
    <rect x="18" y="10" width="4" height="6" opacity="0.6" />
    <rect x="2" y="18" width="6" height="4" opacity="0.3" />
    <rect x="10" y="18" width="6" height="4" opacity="0.6" />
    <rect x="18" y="18" width="4" height="4" />
  </svg>
}
function CropIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6.13 1L6 16a2 2 0 002 2h15" /><path d="M1 6.13L16 6a2 2 0 012 2v15" /></svg>
}
function ApplyCropIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
}
function CancelCropIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
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
function ErrorIcon() {
  return <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
}
