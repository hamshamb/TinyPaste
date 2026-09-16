/**
 * Validates a colour value before it is ever interpolated into a `style`
 * attribute (text colour, highlight colour). An allow-listed shape, not an
 * escaped one — CSS has enough syntax (`url()`, `expression()`, custom
 * properties) that trying to block the dangerous parts of a free-form string
 * is far riskier than only accepting a value that looks like a colour.
 */
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const FUNCTIONAL_COLOR = /^(?:rgb|rgba|hsl|hsla)\(\s*[0-9.]+%?(?:\s*,\s*[0-9.]+%?){2,3}\s*\)$/;

const NAMED_COLORS = new Set([
  'inherit',
  'currentcolor',
  'transparent',
  'black',
  'white',
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'gray',
  'grey',
  'brown',
  'cyan',
  'magenta',
]);

export function isSafeCssColor(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 32) return false;
  return HEX_COLOR.test(trimmed) || FUNCTIONAL_COLOR.test(trimmed) || NAMED_COLORS.has(trimmed.toLowerCase());
}
