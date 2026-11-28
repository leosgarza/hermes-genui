// Modules the bundler provides: the Hermes plugin SDK (supplied by the app at runtime) and CSS imported as text.
declare module "@hermes/plugin-sdk" {
  export const TRANSCRIPT_DIRECTIVE_AREA: string;
  /** The host's new-chat slot (the value the Desktop app registers its own chat-empty content into —
   *  verified against the shipped bundle: every registration's data.render({sessionId}) is drawn). */
  export const CHAT_EMPTY_AREA: string;
  /** The app's curated verbs; only the composer draft API is used here (see the SDK's "Composer draft API"). */
  export const host: {
    composer?: {
      submit(sessionId: string | null, text: string): boolean;
      insertText(sessionId: string | null, text: string, opts?: { mode?: "block" | "inline" | "prefix" }): Promise<boolean>;
      focus(sessionId: string | null): void;
    };
    navigate?: (path: string) => void;
  };
}

declare module "*.css" {
  const text: string;
  export default text;
}

// The app's preload bridge (electron-preload), present when plugin code runs in Hermes Desktop. Blocks read local
// generated files through the one call below — the same one the chat makes for a local MEDIA image. Refusals
// (sensitive file, size cap) and the missing-file sentinel are final there: the photo hides, never a second route.
interface HermesDesktopBridge {
  /** A local file as a `data:` URL; a missing file resolves to an `{ ok: false; error: string }` sentinel, a
   *  refused or over-cap file throws. */
  readFileDataUrl?: (filePath: string) => Promise<unknown>;
}

interface Window {
  hermesDesktop?: HermesDesktopBridge;
}
