import { useEffect, useMemo, useRef, useState } from 'react'
import { Clapperboard, Crosshair, Hand, LocateFixed, MousePointer2, Plus, Ruler, Trash2 } from 'lucide-react'
import { insertPointNearestSegment } from '../domain/editorGeometry'
import { pathLength } from '../domain/geometry'
import { useI18n } from '../i18n/context'
import type { PlaybackFrame } from '../domain/playback'
import { buildCanonicalTrackGeometry } from '../domain/trackGeometry'
import { noteForError } from '../domain/localisedError'
import { imagePixelsFromWorld, scaleFromCalibration } from '../domain/trackImage'
import type { DriveMode, LapSample, Point, SimulationResult, TrackInput } from '../domain/types'
import { INPUT_LIMITS } from '../domain/validation'

/**
 * Target spacing along the control polyline, in metres, used to pick how many
 * stations the corridor is drawn with.
 *
 * The drawn boundary comes out coarser than this -- the polyline understates
 * the spline it approximates, and the outer edge is longer than the centre --
 * so 1.5 here lands around 2.4 m on the widest real circuit. That is the
 * quantity that matters: at a 20 m radius a 2.4 m chord sits 0.04 m off the
 * true curve, against 0.57 m at the fixed 180 stations this replaces.
 */
const DISPLAY_CHORD_M = 1.5
const MIN_DISPLAY_STATIONS = 180
const MAX_DISPLAY_STATIONS = 900

export type EditorTool = 'edit' | 'add' | 'pan' | 'calibrate'

interface TrackCanvasProps {
  track: TrackInput
  result: SimulationResult | null
  selectedSample: number | null
  tool: EditorTool
  fitRequest: number
  playbackEnabled: boolean
  playbackFrame: PlaybackFrame | null
  onPlaybackToggle: () => void
  onToolChange: (tool: EditorTool) => void
  onPointsChange: (points: Point[], checkpoint?: boolean) => void
  onSelectedSample: (index: number | null) => void
  /** Confirmed calibration: pixel length of the marked segment and its real length. */
  onCalibrate: (pixelDistance: number, realMeters: number) => void
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
    ? // Path data, not display: never localised, see i18n/formatNumber.ts.
      `M ${points.map((point) => `${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' L ')}${close ? ' Z' : ''}`
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
  playbackEnabled,
  playbackFrame,
  onPlaybackToggle,
  onToolChange,
  onPointsChange,
  onSelectedSample,
  onCalibrate,
}: TrackCanvasProps) {
  const { t, n } = useI18n()
  const svgRef = useRef<SVGSVGElement>(null)
  const latestPoints = useRef(track.centerline)
  latestPoints.current = track.centerline
  const background = track.background
  const imageScale = background?.scaleMPerPx ?? 1
  // World frame of the background image: origin at (0, 0), metres per pixel.
  const imageWidthM = background ? background.imageWidthPx * imageScale : null
  const imageHeightM = background ? background.imageHeightPx * imageScale : null
  const imageCorners = (width: number, height: number): Point[] => [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ]
  const [viewBox, setViewBox] = useState(() =>
    fitPoints(
      imageWidthM !== null && imageHeightM !== null
        ? [...track.centerline, ...imageCorners(imageWidthM, imageHeightM)]
        : track.centerline,
    ),
  )
  /**
   * The pointer that owns each gesture, not just what it is doing. A bare index
   * meant a second finger landing on another control point overwrote it, and
   * both pointers then steered the newly grabbed one while the first was
   * abandoned mid-drag.
   */
  const [drag, setDrag] = useState<{ pointerId: number; index: number } | null>(null)
  const [panOrigin, setPanOrigin] = useState<{
    pointerId: number
    clientX: number
    clientY: number
    view: ViewBox
  } | null>(null)
  /** Whether this drag has already pushed its undo checkpoint. */
  const dragCheckpointed = useRef(false)
  const [calibrationStart, setCalibrationStart] = useState<Point | null>(null)
  const [calibrationEnd, setCalibrationEnd] = useState<Point | null>(null)
  const [calibrationMeters, setCalibrationMeters] = useState('100')
  const [calibrationError, setCalibrationError] = useState<string | null>(null)
  // Scaled to the lap, not fixed at 180. A real circuit drew its corridor with
  // chords up to 9.6 m -- on an 8 m wide track that reads as a polygon, not a
  // curve. Raising the count is close to free: Adria rebuilds in 0.29 ms at
  // the 840 stations it now asks for, against 0.16 ms at 180.
  //
  // Display only. Every solver path passes settings.sampleCount, so nothing
  // here can move a lap time.
  const canonical = useMemo(() => {
    const stations = Math.min(
      MAX_DISPLAY_STATIONS,
      Math.max(MIN_DISPLAY_STATIONS, Math.round(pathLength(track.centerline) / DISPLAY_CHORD_M)),
    )
    return buildCanonicalTrackGeometry(track, stations)
  }, [track])
  const display = canonical.center
  const boundaries = { left: canonical.left, right: canonical.right }
  const racingLine = useMemo(() => (result ? racingLineRuns(result.samples) : []), [result])

  const fitAll = () =>
    setViewBox(
      fitPoints(
        imageWidthM !== null && imageHeightM !== null
          ? [...latestPoints.current, ...imageCorners(imageWidthM, imageHeightM)]
          : latestPoints.current,
      ),
    )

  // App bumps `fitRequest` whenever the track or background changes; the
  // image dimensions are listed so a late-arriving background also re-fits.
  useEffect(fitAll, [fitRequest, imageWidthM, imageHeightM])

  const clientToWorld = (clientX: number, clientY: number): Point => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: viewBox.x + ((clientX - rect.left) / rect.width) * viewBox.width,
      // Undo the render flip: the drawing group negates y, so moving the
      // pointer down the screen decreases world y.
      y: viewBox.y + viewBox.height - ((clientY - rect.top) / rect.height) * viewBox.height,
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
          y: current.y + current.height - ((event.clientY - rect.top) / rect.height) * current.height,
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
      setPanOrigin({
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        view: viewBox,
      })
      return
    }
    if (tool === 'calibrate' && background) {
      const point = clientToWorld(event.clientX, event.clientY)
      if (!calibrationStart || calibrationEnd) {
        setCalibrationStart(point)
        setCalibrationEnd(null)
        setCalibrationError(null)
      } else {
        setCalibrationEnd(point)
        setCalibrationError(null)
      }
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

  const confirmCalibration = () => {
    if (!calibrationStart || !calibrationEnd) return
    try {
      // The marks are in world units; `scaleFromCalibration` is defined in
      // image pixels. See `imagePixelsFromWorld` for why they differ.
      const pixelDistance = imagePixelsFromWorld(
        Math.hypot(calibrationEnd.x - calibrationStart.x, calibrationEnd.y - calibrationStart.y),
        background?.scaleMPerPx,
      )
      const realMeters = Number(calibrationMeters.replace(',', '.'))
      // Validates here so the App only ever receives a sane scale.
      scaleFromCalibration(pixelDistance, realMeters)
      onCalibrate(pixelDistance, realMeters)
      setCalibrationStart(null)
      setCalibrationEnd(null)
      setCalibrationError(null)
    } catch (error) {
      // The domain names its failure; render it here so the overlay follows a
      // later language switch like everything else does.
      const note = noteForError(error, { key: 'canvas.calibrationInvalid' })
      setCalibrationError('key' in note ? t(note.key, note.params) : note.text)
    }
  }

  const cancelCalibration = () => {
    setCalibrationStart(null)
    setCalibrationEnd(null)
    setCalibrationError(null)
  }

  const endGesture = (event: React.PointerEvent<SVGSVGElement>) => {
    if (drag && drag.pointerId === event.pointerId) setDrag(null)
    if (panOrigin && panOrigin.pointerId === event.pointerId) setPanOrigin(null)
  }

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (panOrigin && panOrigin.pointerId === event.pointerId && rect) {
      setViewBox({
        ...panOrigin.view,
        x: panOrigin.view.x - ((event.clientX - panOrigin.clientX) / rect.width) * panOrigin.view.width,
        y: panOrigin.view.y + ((event.clientY - panOrigin.clientY) / rect.height) * panOrigin.view.height,
      })
    }
    if (drag && drag.pointerId === event.pointerId) {
      const next = [...track.centerline]
      next[drag.index] = clientToWorld(event.clientX, event.clientY)
      // The checkpoint belongs to the first real movement, not to pointerdown:
      // `set` snapshots whatever the present value is at that moment, which is
      // still the unmoved centerline, so undo lands where the drag started.
      onPointsChange(next, !dragCheckpointed.current)
      dragCheckpointed.current = true
    }
  }

  const surfaceCursor =
    tool === 'pan'
      ? panOrigin
        ? 'grabbing'
        : 'grab'
      : tool === 'add' || tool === 'calibrate'
        ? 'crosshair'
        : 'default'
  const roadPath = `${pathOf(boundaries.left)} ${pathOf([...boundaries.right].reverse())}`
  const startLeft = result?.samples[0]?.leftBoundary ?? boundaries.left[0]
  const startRight = result?.samples[0]?.rightBoundary ?? boundaries.right[0]

  return (
    <section className="track-stage" id="workspace" aria-label={t('canvas.sectionLabel')}>
      <div className="canvas-toolbar" role="toolbar" aria-label={t('canvas.toolbarLabel')}>
        <button
          className={tool === 'edit' ? 'active' : ''}
          onClick={() => onToolChange('edit')}
          title={t('canvas.toolEditTitle')}
        >
          <MousePointer2 size={16} /> {t('canvas.toolEdit')}
        </button>
        <button
          className={tool === 'add' ? 'active' : ''}
          onClick={() => onToolChange('add')}
          disabled={track.centerline.length >= INPUT_LIMITS.controlPointsMax}
          title={t('canvas.toolAddTitle')}
        >
          <Plus size={16} /> {t('canvas.toolAdd')}
        </button>
        <button
          className={tool === 'pan' ? 'active' : ''}
          onClick={() => onToolChange('pan')}
          title={t('canvas.toolPanTitle')}
        >
          <Hand size={16} /> {t('canvas.toolPan')}
        </button>
        {background && (
          <button
            className={tool === 'calibrate' ? 'active' : ''}
            onClick={() => {
              cancelCalibration()
              onToolChange('calibrate')
            }}
            title={t('canvas.toolCalibrateTitle')}
          >
            <Ruler size={16} /> {t('canvas.toolCalibrate')}
          </button>
        )}
        <span className="toolbar-separator" />
        <button onClick={fitAll} title={t('canvas.fitTitle')}>
          <LocateFixed size={16} />
          <span className="desktop-only"> {t('canvas.fit')}</span>
        </button>
        <button
          className={playbackEnabled ? 'active' : ''}
          onClick={onPlaybackToggle}
          disabled={!result}
          aria-pressed={playbackEnabled}
          title={t('canvas.playTitle')}
        >
          <Clapperboard size={16} />
          <span className="desktop-only"> {t('canvas.play')}</span>
        </button>
      </div>
      <div className="canvas-hint">
        {tool === 'edit'
          ? t('canvas.hintEdit')
          : tool === 'add'
            ? t('canvas.hintAdd')
            : tool === 'calibrate'
              ? background?.scaleMPerPx
                ? t('canvas.hintCalibrateScale', { scale: n(background.scaleMPerPx, 3) })
                : t('canvas.hintCalibrateStart')
              : t('canvas.hintPan')}
      </div>
      <svg
        ref={svgRef}
        className="track-svg"
        viewBox={`${viewBox.x} ${-(viewBox.y + viewBox.height)} ${viewBox.width} ${viewBox.height}`}
        role="img"
        aria-label={t('canvas.trackAria', { name: track.name, count: track.centerline.length })}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
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
        <g transform="scale(1, -1)">
          <rect
            className="canvas-bg"
            x={viewBox.x}
            y={viewBox.y}
            width={viewBox.width}
            height={viewBox.height}
            fill="url(#small-grid)"
          />
          {background && imageWidthM !== null && imageHeightM !== null && (
            // The group flips y for the whole scene, so the image needs its own
            // counter-flip or the photo would render mirrored upside-down.
            <image
              href={background.imageDataUrl}
              x={0}
              y={0}
              width={imageWidthM}
              height={imageHeightM}
              transform={`translate(0 ${imageHeightM}) scale(1 -1)`}
              opacity={0.85}
              preserveAspectRatio="none"
              pointerEvents="none"
            />
          )}
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
            <path
              d={pathOf(display)}
              fill="none"
              stroke="#7b8b80"
              strokeWidth=".65"
              strokeDasharray="2 1.4"
            />
          )}
          {!!racingLine.length && (
            <g filter="url(#line-glow)">
              {racingLine.map((run, index) => (
                <polyline
                  key={`${run.mode}-${index}`}
                  points={run.points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ')}
                  fill="none"
                  stroke={MODE_COLORS[run.mode]}
                  strokeWidth="1.45"
                  strokeLinecap="butt"
                  strokeLinejoin="round"
                />
              ))}
            </g>
          )}
          {startLeft && startRight && (
            <g aria-label={t('canvas.startLine')}>
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
                <text
                  transform={`translate(${sample.position.x} ${-sample.position.y}) scale(1, -1)`}
                  y={0.85}
                  textAnchor="middle"
                >
                  {index + 1}
                </text>
              </g>
            )
          })}
          {playbackFrame && (
            <g
              className={`playback-kart ${playbackFrame.mode}`}
              transform={`translate(${playbackFrame.position.x} ${playbackFrame.position.y}) rotate(${(playbackFrame.headingRad * 180) / Math.PI})`}
              pointerEvents="none"
              aria-hidden="true"
            >
              <circle r="3.8" className="kart-halo" fill={MODE_COLORS[playbackFrame.mode]} />
              <path
                d="M 2.9 0 L -2 1.9 L -1.1 0 L -2 -1.9 Z"
                fill={MODE_COLORS[playbackFrame.mode]}
                stroke="#0d120f"
                strokeWidth=".38"
                strokeLinejoin="round"
              />
            </g>
          )}
          {!playbackEnabled && selectedSample !== null && result?.samples[selectedSample] && (
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
          {calibrationStart && (
            <g className="calibration-segment" pointerEvents="none">
              {calibrationEnd && (
                <line
                  x1={calibrationStart.x}
                  y1={calibrationStart.y}
                  x2={calibrationEnd.x}
                  y2={calibrationEnd.y}
                  stroke="#61dafb"
                  strokeWidth=".6"
                  strokeDasharray="1.6 1"
                />
              )}
              <circle
                cx={calibrationStart.x}
                cy={calibrationStart.y}
                r="2"
                fill="#61dafb"
                stroke="#101512"
                strokeWidth=".6"
              />
              {calibrationEnd && (
                <circle
                  cx={calibrationEnd.x}
                  cy={calibrationEnd.y}
                  r="2"
                  fill="#61dafb"
                  stroke="#101512"
                  strokeWidth=".6"
                />
              )}
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
                    // No checkpoint here. Pushing one on pointerdown made a
                    // plain click mark the project dirty and leave an undo
                    // entry identical to the present, so the first Ctrl+Z did
                    // nothing.
                    dragCheckpointed.current = false
                    setDrag({ pointerId: event.pointerId, index })
                  }}
                />
                <circle className="control-point" cx={point.x} cy={point.y} r="1.25" />
              </g>
            ))}
        </g>
      </svg>
      {tool === 'calibrate' && calibrationStart && calibrationEnd && (
        <div className="calibration-overlay">
          <label htmlFor="calibration-distance">
            {t('canvas.calibrationLabel')}
            <span className="calibration-input-row">
              <input
                id="calibration-distance"
                type="number"
                min={1}
                max={2000}
                step={1}
                value={calibrationMeters}
                onChange={(event) => setCalibrationMeters(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') confirmCalibration()
                  if (event.key === 'Escape') cancelCalibration()
                }}
              />
              <span className="unit">m</span>
            </span>
          </label>
          {calibrationError && <p className="calibration-error">{calibrationError}</p>}
          <div className="calibration-actions">
            <button onClick={confirmCalibration}>{t('canvas.calibrationApply')}</button>
            <button className="ghost" onClick={cancelCalibration}>
              {t('canvas.calibrationCancel')}
            </button>
          </div>
          <p className="calibration-note">{t('canvas.calibrationNote')}</p>
        </div>
      )}
      <div className="canvas-legend" aria-label={t('canvas.legendLabel')}>
        <span>
          <i className="dot brake" />
          {t('canvas.legendBrake')}
        </span>
        <span>
          <i className="dot coast" />
          {t('canvas.legendCoast')}
        </span>
        <span>
          <i className="dot throttle" />
          {t('canvas.legendThrottle')}
        </span>
      </div>
      {tool === 'edit' && (
        <button
          className="delete-last"
          disabled={track.centerline.length <= 4}
          onClick={() => onPointsChange(track.centerline.slice(0, -1))}
          title={t('canvas.removeLastTitle')}
        >
          <Trash2 size={15} /> {t('canvas.removeLast')}
        </button>
      )}
      <div className="north">
        <Crosshair size={13} />
        <span>N</span>
      </div>
    </section>
  )
}
