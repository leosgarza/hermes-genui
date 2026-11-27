import { clean, firstText, https, keepFirst, str, type Trail } from "../../core/fields";
import { isGeneratedImagePath } from "./localImage";

export type Photo = { url: string; caption?: string; source?: string };
export type ImagesBlock = { type: "images"; title?: string; images: Photo[] };

/**
 * images: a strip of real photos, plus images a Hermes tool generated into a local file. Each photo needs an https
 * url (also `src`) or a generated local path (`url` only — the provenance gate matches `url`, so a path must come
 * through it); caption also `alt` or `title`, source also `credit`. At most 12.
 *   {type: "images", images: [{url: "https://x.example/a.jpg"}, {url: "/Users/me/.hermes/cache/generated/x.png"}]}
 *   → kept; {url: "http://x.example/b.jpg"} → dropped.
 * Dropped: no photo with a drawable url. (The path shape is checked here; show_blocks proved the tool returned it
 * before the board was stored, and Images.tsx only ever reads such a path through the desktop host.)
 */
export function readImages(raw: any, here: Trail): ImagesBlock | null {
  const list = Array.isArray(raw.images) ? raw.images : Array.isArray(raw.photos) ? raw.photos : [];
  const photos: Photo[] = [];
  list.forEach((p: any, i: number) => {
    const local = isGeneratedImagePath(p?.url) ? (p.url as string) : undefined;
    const url = https(p?.url) ?? https(p?.src) ?? local;
    if (!url) {
      here.at("images").at(i).drop("photo needs an https url or a generated image path");
      return;
    }
    photos.push(clean({ url, caption: firstText([p.caption, p.alt, p.title], 120), source: firstText([p.source, p.credit], 60) }));
  });
  if (!photos.length) return here.drop("images has no drawable photo");
  return clean({ type: "images" as const, title: str(raw.title, 60), images: keepFirst(photos, 12, here, "photos") });
}
