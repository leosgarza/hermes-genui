// A generated image saved as a local file: Hermes Desktop shows it by asking the host to read the file into a data
// URL — the same path the chat already takes for a local MEDIA image. Only a path show_blocks proved a tool
// returned reaches this file: the Python half checked the board against the provenance store before storing it.
// The host's own guards are FINAL: a sensitive-file refusal or a configured-size-cap throw ends the read, and the
// photo hides itself, like a dead https link does. There is deliberately no second read route — re-reading a path
// the host refused (or that broke its size cap) over some other channel would undo that security decision, and a
// gateway file read would be a new network call this feature never warranted.

/** The longest path worth trying; a real generated path is nowhere near this. */
const MAX_PATH = 500;

/** An absolute local file path (POSIX /…, a Windows drive C:\…, a UNC share \\server\share). A scheme — https:,
 *  file:, data: — is a URL, not a path. Mirrors the Python side's is_local_path. */
export function isGeneratedImagePath(v: unknown): boolean {
  if (typeof v !== "string" || !v || v.length > MAX_PATH || /[\u0000-\u001f\u007f]/.test(v)) return false;
  if (/^[A-Za-z]:[\\/]/.test(v)) return true; // a drive letter spells like a scheme: it is a path
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(v)) return false; // any other scheme (https:, file:, data:) is not a path
  return v.startsWith("/") || v.startsWith("\\\\");
}

/** path → its pending or finished read. One read per path, however many times the board remounts; a failure is
 *  dropped so a later look tries again (a file written a moment after the first look still shows up). */
const reads = new Map<string, Promise<string>>();

/** The one read route: the desktop host's file reader, exactly what the chat uses for a local MEDIA image.
 *  A missing file answers with an {ok:false} sentinel (not a throw); a sensitive-file refusal or a size-cap hit
 *  throws. All of those fail the same way here — rejected, final. Off Desktop (no bridge, or a build without the
 *  reader) there is no local file to read at all, so that rejects too and the photo stays hidden. */
async function readFromHost(path: string): Promise<string> {
  const bridge = typeof window === "undefined" ? undefined : window.hermesDesktop;
  if (!bridge?.readFileDataUrl) throw new Error(`no desktop file reader for ${path}`);
  const r = await bridge.readFileDataUrl(path);
  if (typeof r === "string" && r.startsWith("data:")) return r;
  throw new Error(`the desktop file reader gave no data url for ${path}`);
}

/** The file as a `data:` URL. Resolves once per path; rejects when the host read fails for any reason (off
 *  Desktop, missing, too big, unreadable, refused) — a rejection hides the photo and is never retried elsewhere. */
export function readGeneratedImageDataUrl(path: string): Promise<string> {
  let read = reads.get(path);
  if (!read) {
    read = readFromHost(path).catch((e) => {
      reads.delete(path);
      throw e;
    });
    reads.set(path, read);
    if (reads.size > 32) {
      const oldest = reads.keys().next().value;
      if (oldest !== undefined && oldest !== path) reads.delete(oldest);
    }
  }
  return read;
}

/** Tests only: forget what was read, so a suite starts clean. */
export function clearGeneratedImageCache(): void {
  reads.clear();
}
