// A strip of real photos, each with its caption and credit. A photo that fails to load (a dead link, a hotlink
// block) hides itself; when none load the strip disappears. Clicking one opens it full size. A photo whose url is a
// generated local path asks the desktop host to read the file (blocks/images/localImage.ts) and shows nothing until
// that answers; a failed read hides it, like a dead link.
import { useEffect, useRef, useState } from "react";
import { isTopLayer, popLayer, pushLayer } from "../../core/overlays";
import type { ImagesBlock, Photo } from "./read";
import { isGeneratedImagePath, readGeneratedImageDataUrl } from "./localImage";

/** One photo as drawn: its url, or the file's data url once the host reads it. */
type Shown = { photo: Photo; src: string };

export function Images({ block }: { block: ImagesBlock }) {
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [dataUrls, setDataUrls] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<Shown | null>(null);
  const fail = (url: string) => setFailed((before) => new Set(before).add(url));
  // A local path has no src until its read answers; an https photo has one the moment the block is read.
  const srcOf = (p: Photo) => (isGeneratedImagePath(p.url) ? dataUrls[p.url] : p.url);

  // Ask the host once per path (the module also caches across remounts); a rejection hides that photo.
  const asked = useRef(new Set<string>());
  useEffect(() => {
    for (const p of block.images) {
      if (!isGeneratedImagePath(p.url) || asked.current.has(p.url)) continue;
      asked.current.add(p.url);
      readGeneratedImageDataUrl(p.url).then(
        (url) => setDataUrls((before) => (before[p.url] ? before : { ...before, [p.url]: url })),
        () => fail(p.url),
      );
    }
  }, [block]);

  const shown = block.images
    .map((photo): Shown | null => {
      const src = failed.has(photo.url) ? undefined : srcOf(photo);
      return src === undefined ? null : { photo, src };
    })
    .filter((s): s is Shown => s !== null);
  if (!shown.length) return null;

  return (
    <figure className="hb-photos">
      {block.title && <figcaption className="hb-chart-title">{block.title}</figcaption>}
      <div className="hb-photo-strip">
        {shown.map(({ photo, src }) => (
          <button key={photo.url} type="button" className="hb-photo" onClick={() => setOpen({ photo, src })} aria-label={photo.caption ?? "Open photo"}>
            <img src={src} alt={photo.caption ?? ""} loading="lazy" referrerPolicy="no-referrer" onError={() => fail(photo.url)} />
            {(photo.caption || photo.source) && (
              <span className="hb-photo-text">
                {photo.caption && <span className="hb-photo-caption">{photo.caption}</span>}
                {photo.source && <span className="hb-photo-source">{photo.source}</span>}
              </span>
            )}
          </button>
        ))}
      </div>
      {open && <Overlay shown={open} onClose={() => setOpen(null)} />}
    </figure>
  );
}

/** The photo full size, fixed over the window (plugins get no react-dom, so no portal); a click anywhere
 *  or Escape closes it. */
function Overlay({ shown, onClose }: { shown: Shown; onClose: () => void }) {
  useEffect(() => {
    const layer = pushLayer();  // the photo is the topmost thing a key can answer while it is up
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !isTopLayer(layer)) return;  // (core/overlays.ts)
      e.stopImmediatePropagation();  // one keypress steps down exactly one layer
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      popLayer(layer);
    };
  }, [onClose]);
  const { photo, src } = shown;
  return (
    <div className="hb-photo-overlay" role="dialog" aria-label={photo.caption ?? "Photo"} onClick={onClose}>
      <img src={src} alt={photo.caption ?? ""} referrerPolicy="no-referrer" />
      {(photo.caption || photo.source) && (
        <div className="hb-photo-overlay-text">
          {photo.caption}
          {photo.source && <span> · {photo.source}</span>}
        </div>
      )}
    </div>
  );
}
