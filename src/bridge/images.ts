/**
 * Turning an image reference in the Markdown into something the WebView can
 * load. PRD Section 25 — QuickNote makes no network request.
 */

/** Anything with a scheme QuickNote will not fetch. */
const REMOTE = /^(https?|ftp|ws):/i;

const DATA = /^data:/i;

/**
 * True for a path that already names a location on its own.
 *
 * Windows writes three of these — `C:/photos/a.png`, `C:\photos\a.png`, and
 * `\\server\share\a.png`. Testing for a leading `/` alone joins them onto the
 * note directory, and the image never resolves.
 */
export function isAbsolutePath(url: string): boolean {
  return (
    url.startsWith("/") || url.startsWith("\\") || /^[A-Za-z]:[/\\]/.test(url)
  );
}

/**
 * Resolves one reference against the directory that holds the note.
 *
 * `convert` is the platform's file-to-URL step. Passing it in rather than
 * reaching for it keeps this function pure, so both branches can be tested
 * without a WebView. A backend that cannot load local files passes null.
 */
export function resolveImageSrc(
  url: string,
  noteDir: string,
  convert: ((path: string) => string) | null,
): string | null {
  if (REMOTE.test(url)) return null;
  if (DATA.test(url)) return url;
  if (!convert) return null;

  const absolute = isAbsolutePath(url) ? url : `${noteDir}/${url}`;
  try {
    return convert(absolute);
  } catch {
    return null;
  }
}
