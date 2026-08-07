import { useEffect, useMemo, useRef, useState } from 'react'
import { Crosshair, Hand, LocateFixed, MousePointer2, Plus, Trash2 } from 'lucide-react'
import { insertPointNearestSegment } from '../domain/editorGeometry'
import { buildCanonicalTrackGeometry } from '../domain/trackGeometry'
import type { DriveMode, LapSample, Point, SimulationResult, TrackInput } from '../domain/types'
import { INPUT_LIMITS } from '../domain/validation'

export type EditorTool = 'edit' | 'add' | 'pan'

interface TrackCanvasProps {
  track: TrackInput
  result: SimulationResult | null
  selectedSample: number | null
  tool: EditorTool
  fitRequest: number
  onToolChange: (tool: EditorTool) => void
  onPointsChange: (points: Point[], checkpoint?: boolean) => void
  onSelectedSample: (index: number | null) => void
}

interface ViewBox {
  x: number
  y: number
  width: number
  height: number
}

const MODE_COLORS = { brake: '#ff5c4d', coast: '#ffd166', throttle: '#6ee7a8' }

function fitPoints(points: Point[]): ViewBox {
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const width = Math.max(40, maxX - minX + 28)
  const height = Math.max(40, maxY - minY + 28)
  return { x: (minX + maxX - width) / 2, y: (minY + maxY - height) / 2, width, height }
}

const pathOf = (points: Point[], close = true) =>
  points.length
    ? `M ${points.map((point) => `${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' L ')}${close ? ' Z' : ''}`
    : ''

interface ModeRun {
  mode: DriveMode
  points: Point[]
}

/**
 * Group consecutive samples that share a drive mode into single polylines.
 *
 * One filtered `<line>` per sample means hundreds of blurred SVG nodes to
 * repaint on every drag; a lap only has a handful of brake/coast/throttle runs.
 * Each run repeats its successor's first point so the colours stay joined.
 */
function racingLineRuns(samples: LapSample[]): ModeRun[] {
  const runs: ModeRun[] = []
  samples.forEach((sample, index) => {
    const next = samples[(index + 1) % samples.length]
    const current = runs[runs.length - 1]
    if (current && current.mode === sample.mode) current.points.push(next.position)
    else runs.push({ mode: sample.mode, points: [sample.position, next.position] })
  })
  return runs
}

export function TrackCanvas({
  track,
  result,
  selectedSample,
  tool,
  fitRequest,
  onToolChange,
  onPointsChange,
  onSelectedSample,
}: TrackCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const latestPoints = useRef(track.centerline)
  latestPoints.current = track.centerline
  const [viewBox, setViewBox] = useState(() => fitPoints(track.centerline))
  const [dragPoint, setDragPoint] = useState<number | null>(null)
  const [panOrigin, setPanOrigin] = useState<{ clientX: number; clientY: number; view: ViewBox } | null>(null)
  const canonical = useMemo(() => buildCanonicalTrackGeometry(track, 180), [track])
  const display = canonical.center
  const boundaries = { left: canonical.left, right: canonical.right }
  const racingLine = useMemo(() => (result ? racingLineRuns(result.samples) : []), [result])

  useEffect(() => setViewBox(fitPoints(latestPoints.current)), [fitRequest])

  const clientToWorld = (clientX: number, clientY: number): Point => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: viewBox.x + ((clientX - rect.left) / rect.width) * viewBox.width,
      y: viewBox.y + ((clientY - rect.top) / rect.height) * viewBox.height,
    }
  }

  // React registers `wheel` passively on the root, so a JSX `onWheel` handler
  // cannot call preventDefault: the page would scroll while the canvas zoomed.
  // Binding it directly with `{ passive: false }` is the only way to stop that.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = svg.getBoundingClientRect()
      setViewBox((current) => {
        const cursor = {
          x: current.x + ((event.clientX - rect.left) / rect.width) * current.width,
          y: current.y + ((event.clientY - rect.top) / rect.height) * current.height,
        }
        const factor = event.deltaY > 0 ? 1.12 : 0.89
        const width = Math.min(600, Math.max(25, current.width * factor))
        const height = (current.height * width) / current.width
        const ratioX = (cursor.x - current.x) / current.width
        const ratioY = (cursor.y - current.y) / current.height
        return { x: cursor.x - ratioX * width, y: cursor.y - ratioY * height, width, height }
      })
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [])

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button === 1 || tool === 'pan') {
      event.currentTarget.setPointerCapture(event.pointerId)
      setPanOrigin({ clientX: event.clientX, clientY: event.clientY, view: viewBox })
      return
    }
    if (
      tool === 'add' &&
      track.centerline.length < INPUT_LIMITS.controlPointsMax &&
      !(event.target as SVGElement).closest('.event-marker')
    ) {
      onPointsChange(insertPointNearestSegment(track.centerline, clientToWorld(event.clientX, event.clientY)))
    }
  }

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (panOrigin && rect) {
      setViewBox({
        ...panOrigin.view,
        x: panOrigin.view.x - ((event.clientX - panOrigin.clientX) / rect.width) * panOrigin.view.width,
        y: panOrigin.view.y - ((event.clientY - panOrigin.clientY) / rect.height) * panOrigin.view.height,
      })
    }
    if (dragPoint !== null) {
      const next = [...track.centerline]
      next[dragPoint] = clientToWorld(event.clientX, event.clientY)
      onPointsChange(next, false)
    }
  }

  const surfaceCursor =
    tool === 'pan' ? (panOrigin ? 'grabbing' : 'grab') : tool === 'add' ? 'crosshair' : 'default'
  const roadPath = `${pathOf(boundaries.left)} ${pathOf([...boundaries.right].reverse())}`
  const startLeft = result?.samples[0]?.leftBoundary ?? boundaries.left[0]
  const startRight = result?.samples[0]?.rightBoundary ?? boundaries.right[0]

  return (
    <section className="track-stage" id="workspace" aria-label="Editor visual da pista">
      <div className="canvas-toolbar" role="toolbar" aria-label="Ferramentas do editor">
        <button
          className={tool === 'edit' ? 'active' : ''}
          onClick={() => onToolChange('edit')}
          title="Editar pontos (V)"
        >
          <MousePointer2 size={16} /> Editar
        </button>
        <button
          className={tool === 'add' ? 'active' : ''}
          onClick={() => onToolChange('add')}
          disabled={track.centerline.length >= INPUT_LIMITS.controlPointsMax}
          title="Adicionar ponto (A)"
        >
          <Plus size={16} /> Ponto
        </button>
        <button
          className={tool === 'pan' ? 'active' : ''}
          onClick={() => onToolChange('pan')}
          title="Mover visualização (H)"
        >
          <Hand size={16} /> Mover
        </button>
        <span className="toolbar-separator" />
        <button onClick={() => setViewBox(fitPoints(track.centerline))} title="Enquadrar pista">
          <LocateFixed size={16} />
          <span className="desktop-only"> Enquadrar</span>
        </button>
      </div>
      <div className="canvas-hint">
        {tool === 'edit'
          ? 'Arraste os pontos para ajustar o traçado'
          : tool === 'add'
            ? 'Clique no fundo para adicionar pontos'
            : 'Arraste para mover · role para ampliar'}
      </div>
      <svg
        ref={svgRef}
        className="track-svg"
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        role="img"
        aria-label={`Traçado ${track.name} com ${track.centerline.length} pontos de controle`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => {
          setDragPoint(null)
          setPanOrigin(null)
        }}
        onPointerCancel={() => {
          setDragPoint(null)
          setPanOrigin(null)
        }}
        style={{ cursor: surfaceCursor }}
      >
        <defs>
          <pattern id="small-grid" width="5" height="5" patternUnits="userSpaceOnUse">
            <path d="M 5 0 L 0 0 0 5" fill="none" stroke="rgba(255,255,255,.035)" strokeWidth=".25" />
          </pattern>
          <filter id="line-glow">
            <feGaussianBlur stdDeviation=".8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect
          className="canvas-bg"
          x={viewBox.x}
          y={viewBox.y}
          width={viewBox.width}
          height={viewBox.height}
          fill="url(#small-grid)"
        />
        <path d={roadPath} fill="#262e29" fillRule="evenodd" stroke="#526057" strokeWidth=".45" />
        <path
          d={pathOf(boundaries.left)}
          fill="none"
          stroke="#e9eee9"
          strokeWidth=".45"
          strokeDasharray="1.4 1.4"
        />
        <path
          d={pathOf(boundaries.right)}
          fill="none"
          stroke="#e9eee9"
          strokeWidth=".45"
          strokeDasharray="1.4 1.4"
        />
        {!result && (
          <path d={pathOf(display)} fill="none" stroke="#7b8b80" strokeWidth=".65" strokeDasharray="2 1.4" />
        )}
        {racingLine.map((run, index) => (
          <polyline
            key={`${run.mode}-${index}`}
            points={run.points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ')}
            fill="none"
            stroke={MODE_COLORS[run.mode]}
            strokeWidth="1.45"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#line-glow)"
          />
        ))}
        {startLeft && startRight && (
          <g aria-label="Linha de largada">
            <line
              x1={startLeft.x}
              y1={startLeft.y}
              x2={startRight.x}
              y2={startRight.y}
              stroke="#fff"
              strokeWidth="1.5"
            />
            <line
              x1={startLeft.x}
              y1={startLeft.y}
              x2={startRight.x}
              y2={startRight.y}
              stroke="#121713"
              strokeWidth=".45"
              strokeDasharray="1 1"
            />
          </g>
        )}
        {result?.events.slice(0, 10).map((event, index) => {
          const sample = result.samples[event.sampleIndex]
          if (!sample) return null
          return (
            <g
              key={`${event.kind}-${event.sampleIndex}`}
              className="event-marker"
              onClick={() => onSelectedSample(event.sampleIndex)}
            >
              <circle
                cx={sample.position.x}
                cy={sample.position.y}
                r="2.2"
                fill={event.kind === 'brake' ? '#ff5c4d' : event.kind === 'apex' ? '#61dafb' : '#6ee7a8'}
                stroke="#101512"
                strokeWidth=".7"
              />
              <text x={sample.position.x} y={sample.position.y + 0.85} textAnchor="middle">
                {index + 1}
              </text>
            </g>
          )
        })}
        {selectedSample !== null && result?.samples[selectedSample] && (
          <g className="selected-kart" pointerEvents="none">
            <circle
              cx={result.samples[selectedSample].position.x}
              cy={result.samples[selectedSample].position.y}
              r="3.4"
            />
            <circle
              cx={result.samples[selectedSample].position.x}
              cy={result.samples[selectedSample].position.y}
              r="1.25"
            />
          </g>
        )}
        {tool === 'edit' &&
          track.centerline.map((point, index) => (
            <g key={index}>
              <circle
                className="control-hit"
                cx={point.x}
                cy={point.y}
                r="3.2"
                onPointerDown={(event) => {
                  event.stopPropagation()
                  event.currentTarget.setPointerCapture(event.pointerId)
                  onPointsChange([...track.centerline], true)
                  setDragPoint(index)
                }}
              />
              <circle className="control-point" cx={point.x} cy={point.y} r="1.25" />
            </g>
          ))}
      </svg>
      <div className="canvas-legend" aria-label="Legenda">
        <span>
          <i className="dot brake" />
          Freio
        </span>
        <span>
          <i className="dot coast" />
          Transição
        </span>
        <span>
          <i className="dot throttle" />
          Acelerador
        </span>
      </div>
      {tool === 'edit' && (
        <button
          className="delete-last"
          disabled={track.centerline.length <= 4}
          onClick={() => onPointsChange(track.centerline.slice(0, -1))}
          title="Remover último ponto"
        >
          <Trash2 size={15} /> Remover último
        </button>
      )}
      <div className="north">
        <Crosshair size={13} />
        <span>N</span>
      </div>
    </section>
  )
}
