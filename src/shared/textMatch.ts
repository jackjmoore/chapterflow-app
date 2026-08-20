/** Escapes regex-special characters so arbitrary user text can be dropped
 *  into a RegExp source as a literal. Shared by the Find/Replace engine
 *  (`renderer/src/search/searchCore.ts`) and the Story Bible mention matcher
 *  (`shared/mentionMatcher.ts`) so "what counts as a literal match" can never
 *  drift between the two. */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
