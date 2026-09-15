/** Tiny class-name joiner. Avoids pulling in clsx for a five-line helper. */
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}
