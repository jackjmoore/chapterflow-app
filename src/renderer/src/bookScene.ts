import {
  BoxGeometry,
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  RepeatWrapping,
  Scene,
  WebGLRenderer
} from 'three'

/**
 * The 3D half of Book View: a deliberately minimal open-book form.
 *
 * The whole point is spatial context — how much book lies on each side of the
 * open spread — so the scene is exactly that and nothing else: two page
 * blocks whose thicknesses shift as you read, and a cover slab beneath. No
 * lights (flat materials), no textures beyond a stripe suggesting page edges,
 * no animation loop — render() runs only when something changed.
 *
 * The readable spread is NOT in this scene. It is plain DOM, centered over
 * the canvas and tilted with a CSS perspective transform built from the same
 * three numbers this camera uses (focal length, distance, tilt), which
 * onProjection reports after every resize. One set of numbers, two renderers
 * that agree — chosen over CSS3DRenderer, whose synced-DOM layer proved
 * unreliable under this app's stacking contexts.
 *
 * Plain TS rather than a component so React re-renders can never re-create
 * GL state; the component owns exactly one handle and disposes it on unmount.
 */

/** Tilt of the whole book, radians about X. Negative tips the top away —
 *  edge-on enough to read thickness, flat enough to read the page. Kept
 *  shallow: at steeper angles the foreshortening cost every line of text more
 *  legibility than the extra depth cue was worth. */
export const BOOK_TILT_RAD = -0.16

export interface BookProjection {
  /** On-screen size of one CSS pixel at the spread's plane. */
  scale: number
  /** CSS `perspective()` distance that reproduces the camera's foreshortening. */
  perspectivePx: number
}

export interface BookSceneOptions {
  /** One page leaf, CSS pixels — world units are pixels throughout. */
  pageWidthPx: number
  pageHeightPx: number
  pageCount: number
  /** Fired on every resize with the numbers the DOM spread needs to match. */
  onProjection: (projection: BookProjection) => void
}

export interface BookSceneHandle {
  /** Re-proportions the side blocks: pages read vs pages remaining. */
  setProgress(pagesBefore: number, pagesAfter: number): void
  resize(): void
  dispose(): void
}

/** Total thickness budget for the closed part of the book. Grows with length
 *  so a novella and an epic read differently, but clamped: thickness is a
 *  progress cue, not a measurement. */
function thicknessBudget(pageCount: number): number {
  return Math.min(96, Math.max(20, pageCount * 0.9))
}

/** The page tokens as currently rendered — includes any theme-preset or
 *  custom page color, so the 3D body matches the pages resting on it. */
function currentPageColors(): { paper: string; edgeBase: string; edgeLine: string } {
  const styles = getComputedStyle(document.documentElement)
  const paper = styles.getPropertyValue('--editor-bg').trim() || '#faf6ec'
  const surround = styles.getPropertyValue('--editor-surround').trim() || '#e6e2d9'
  return { paper, edgeBase: paper, edgeLine: surround }
}

/** Paper-edge stripe: a tiny repeating canvas, the one texture in the scene.
 *  Suggests stacked pages without pretending to be paper. */
function makeEdgeTexture(edgeBase: string, edgeLine: string): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 8
  canvas.height = 8
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = edgeBase
    ctx.fillRect(0, 0, 8, 8)
    ctx.fillStyle = edgeLine
    ctx.fillRect(0, 3, 8, 1)
  }
  const texture = new CanvasTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  return texture
}

export function createBookScene(container: HTMLElement, options: BookSceneOptions): BookSceneHandle {
  const { pageWidthPx, pageHeightPx, pageCount, onProjection } = options
  const budget = thicknessBudget(pageCount)

  const scene = new Scene()
  const camera = new PerspectiveCamera(32, 1, 10, 20000)

  const renderer = new WebGLRenderer({ alpha: true, antialias: true })
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.domElement.className = 'book-scene-gl'
  container.appendChild(renderer.domElement)

  // Everything tilts together — the tilt is what makes thickness legible at
  // all (edge-on, a block of any depth is invisible).
  const book = new Group()
  book.rotation.x = BOOK_TILT_RAD
  scene.add(book)

  const pageColors = currentPageColors()
  const edgeTexture = makeEdgeTexture(pageColors.edgeBase, pageColors.edgeLine)
  const paper = new MeshBasicMaterial({ color: pageColors.paper })
  const edge = new MeshBasicMaterial({ map: edgeTexture })
  const coverMaterial = new MeshBasicMaterial({ color: 0x5b4636 })

  // Unit-depth boxes scaled per progress update — updating thickness is a
  // scale write, never a geometry rebuild.
  const blockGeometry = new BoxGeometry(pageWidthPx, pageHeightPx, 1)
  const blockMaterials = [edge, edge, edge, edge, paper, paper]
  const leftBlock = new Mesh(blockGeometry, blockMaterials)
  const rightBlock = new Mesh(blockGeometry, blockMaterials)
  leftBlock.position.x = -pageWidthPx / 2
  rightBlock.position.x = pageWidthPx / 2
  book.add(leftBlock, rightBlock)

  const COVER_THICKNESS = 8
  const coverGeometry = new BoxGeometry(pageWidthPx * 2 + 24, pageHeightPx + 16, COVER_THICKNESS)
  const cover = new Mesh(coverGeometry, coverMaterial)
  book.add(cover)

  function render(): void {
    renderer.render(scene, camera)
  }

  function setProgress(pagesBefore: number, pagesAfter: number): void {
    const total = Math.max(1, pagesBefore + pagesAfter)
    // A side you've started always shows at least a sliver — "almost done"
    // should look different from "done".
    const left = pagesBefore === 0 ? 0.001 : Math.max(4, (pagesBefore / total) * budget)
    const right = pagesAfter === 0 ? 0.001 : Math.max(4, (pagesAfter / total) * budget)
    leftBlock.scale.z = left
    leftBlock.position.z = -left / 2
    rightBlock.scale.z = right
    rightBlock.position.z = -right / 2
    // The cover hugs the deeper block rather than sitting at the full-budget
    // depth: a fixed-depth cover left a visible void between the page block's
    // back and the cover on short books, which is what made the top edge read
    // as terminating in mid-air instead of closing onto the binding.
    cover.position.z = -(Math.max(left, right) + COVER_THICKNESS / 2)
    render()
  }

  function resize(): void {
    const width = container.clientWidth
    const height = container.clientHeight
    if (width === 0 || height === 0) return
    renderer.setSize(width, height)
    camera.aspect = width / height

    // Back the camera off until the tilted spread fits with a little air.
    // World units are pixels, so the fit is exact rather than tuned. The air
    // is deliberately thin — every point of margin here is font size the
    // reader loses on the page.
    const halfFovRad = (camera.fov / 2) * (Math.PI / 180)
    const spreadHalfWidth = pageWidthPx * 1.04
    const spreadHalfHeight = (pageHeightPx / 2) * 1.07
    const fitHeight = spreadHalfHeight / Math.tan(halfFovRad)
    const fitWidth = spreadHalfWidth / (Math.tan(halfFovRad) * camera.aspect)
    const distance = Math.max(fitHeight, fitWidth)
    camera.position.set(0, 0, distance)
    camera.updateProjectionMatrix()

    // The same projection, expressed for CSS: focal length in pixels gives
    // the DOM spread its base scale, camera distance its foreshortening.
    const focalPx = height / 2 / Math.tan(halfFovRad)
    onProjection({ scale: focalPx / distance, perspectivePx: distance })
    render()
  }

  function dispose(): void {
    blockGeometry.dispose()
    coverGeometry.dispose()
    paper.dispose()
    edge.dispose()
    coverMaterial.dispose()
    edgeTexture.dispose()
    renderer.dispose()
    renderer.domElement.remove()
  }

  resize()
  return { setProgress, resize, dispose }
}
