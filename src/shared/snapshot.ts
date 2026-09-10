export interface SnapshotMeta {
  id: string
  timestamp: string
  name: string | null
  auto: boolean
}

// Plain-text extraction for diffing used to live here as a regex strip. It now
// lives in the renderer's revisionDiff.ts, which parses through the editor's
// real schema instead — revision mode needs every character to keep its
// document position, which a regex pass cannot preserve. Both the inline mode
// and the Compare Snapshots modal share that one extraction.
