import type { StoryBibleTypeDef } from './storyBible'

/** Starting item-type list for a brand-new project — fully editable
 *  afterward (rename, recolor, add, remove) via Manage Types…, the same way
 *  DEFAULT_STATUSES seeds the status list. */
export const DEFAULT_STORY_BIBLE_TYPES: StoryBibleTypeDef[] = [
  { id: 'sb-character', name: 'Character', color: '#6f95b8' },
  { id: 'sb-location', name: 'Location', color: '#4b9363' },
  { id: 'sb-object', name: 'Object', color: '#d9a441' }
]
