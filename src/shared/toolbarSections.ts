export type ToolbarSectionId = 'history' | 'style' | 'font' | 'marks' | 'colors' | 'align' | 'lineHeight' | 'lists'

export const TOOLBAR_SECTIONS: { id: ToolbarSectionId; label: string }[] = [
  { id: 'history', label: 'Undo / Redo' },
  { id: 'style', label: 'Paragraph Style' },
  { id: 'font', label: 'Font & Size' },
  { id: 'marks', label: 'Bold / Italic / Underline' },
  { id: 'colors', label: 'Text & Highlight Color' },
  { id: 'align', label: 'Alignment' },
  { id: 'lineHeight', label: 'Line Spacing' },
  { id: 'lists', label: 'Lists & Indent' }
]
