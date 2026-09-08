/** Resolve bundled public assets under the configured deployment mount. */
export const PUBLIC_BASE = import.meta.env?.BASE_URL ?? '/'
export function publicPath(path: string): string {
  return `${PUBLIC_BASE}${path.replace(/^\/+/, '')}`
}
