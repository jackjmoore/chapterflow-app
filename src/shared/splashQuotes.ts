/**
 * The line under the wordmark on the landing page.
 *
 * A title-screen splash: company rather than information. One is chosen at
 * random each time the screen mounts, so it is a small piece of variety on a
 * page somebody opens every day — never a message the app needs to deliver.
 *
 * Only quotations with solid provenance are here. Two of the most famous
 * writing lines are deliberately absent because they are misattributed:
 * "Write drunk, edit sober" is not Hemingway (it is a garbled Peter De Vries
 * line), and "kill your darlings" is Arthur Quiller-Couch rather than
 * Faulkner or King — so the real one is quoted instead. Anything added here
 * should clear the same bar.
 */
export interface SplashQuote {
  text: string
  source: string
}

export const SPLASH_QUOTES: SplashQuote[] = [
  { text: 'The scariest moment is always just before you start.', source: 'Stephen King, On Writing' },
  { text: 'I love deadlines. I love the whooshing noise they make as they go by.', source: 'Douglas Adams' },
  { text: 'A word after a word after a word is power.', source: 'Margaret Atwood' },
  {
    text: 'Not that the story need be long, but it will take a long while to make it short.',
    source: 'Henry David Thoreau'
  },
  {
    text: 'If there’s a book that you want to read, but it hasn’t been written yet, then you must write it.',
    source: 'Toni Morrison'
  },
  { text: 'The road to hell is paved with adverbs.', source: 'Stephen King, On Writing' },
  {
    text: 'Get it down. Take chances. It may be bad, but it’s the only way you can do anything really good.',
    source: 'William Faulkner'
  },
  { text: 'You can’t wait for inspiration. You have to go after it with a club.', source: 'Jack London' },
  { text: 'Murder your darlings.', source: 'Arthur Quiller-Couch, On the Art of Writing' },
  { text: 'I write entirely to find out what I’m thinking.', source: 'Joan Didion' },
  {
    text: 'Start writing, no matter what. The water does not flow until the faucet is turned on.',
    source: 'Louis L’Amour'
  },
  {
    text: 'Sometimes it comes easily and perfectly; sometimes it’s like drilling rock and then blasting it out with charges.',
    source: 'Ernest Hemingway'
  }
]

export function randomSplash(): SplashQuote {
  return SPLASH_QUOTES[Math.floor(Math.random() * SPLASH_QUOTES.length)]
}
