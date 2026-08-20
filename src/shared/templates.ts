export type TemplateId = 'blank' | 'three-act' | 'nonfiction'

export interface TemplateOption {
  id: TemplateId
  label: string
  description: string
}

export const TEMPLATE_OPTIONS: TemplateOption[] = [
  { id: 'blank', label: 'Blank', description: 'Start with an empty binder — no folders or documents.' },
  {
    id: 'three-act',
    label: 'Three-Act Structure',
    description: 'Act One, Act Two, and Act Three folders, pre-populated with placeholder chapters.'
  },
  {
    id: 'nonfiction',
    label: 'Blank Nonfiction',
    description: 'Front Matter, Chapters, and Back Matter folders with a starter document in each.'
  }
]
