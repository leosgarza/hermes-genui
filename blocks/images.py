"""images: a strip of photos with captions and sources."""

from .atoms import text_image
from .common import is_https, is_local_path, safe_text


def check_images(block: dict, path: str) -> list[tuple[str, str]]:
    """Drawable when one photo has an https url (a web photo) or an absolute local path (an image image_generate
    saved). The shape is checked here; show_blocks' provenance gate is what proves the tool returned either."""
    images = block.get("images")
    if isinstance(images, list) and any(
        isinstance(im, dict) and (is_https(im.get("url")) or is_local_path(im.get("url"))) for im in images
    ):
        return []
    return [(path, "images needs at least one https url or generated image path")]


def text_images(block: dict) -> str:
    """The title, then a line per photo: "![Fushimi Inari](https://...) [Wikimedia]"; a bad URL keeps the caption;
    a generated local image says "(generated image)" — a text-only app can't read the file, and the path is noise."""
    photos = block.get("images") if isinstance(block.get("images"), list) else []
    lines = []
    for photo in photos[:12]:
        if not isinstance(photo, dict):
            continue
        if is_local_path(photo.get("url")):
            caption = safe_text(photo.get("caption"))
            lines.append(f"{caption} (generated image)" if caption else "Generated image")
            continue
        line, source = text_image(photo), safe_text(photo.get("source"))
        if line:
            lines.append(f"{line} [{source}]" if source else line)
    title = safe_text(block.get("title"))
    return "\n".join(([f"**{title}**"] if title and lines else []) + lines)
