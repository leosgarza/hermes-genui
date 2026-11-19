// The quiet strip a board offers beneath itself (core/readBlocks.ts `followUps`): up to four follow-up prompts
// the AI chose, each one tap from continuing the conversation. The reader has no controls — the presentation is
// AI-directed — and a tap sends that prompt to the chat over the EXISTING route: composerActions.send on the
// explicit force path the interactive table shipped (a prompt past MAX_SENT is posted whole, not left in the
// composer; the command/file guard still holds, and what it does is told plainly). The word on the row is only
// ever the host's own answer to the LAST tap — sent, drafted, blocked, failed, or nowhere — and a slow answer
// about an earlier tap can never mislabel a newer choice (the ticks of that table's lesson, kept). A NEW tap,
// though, clears the old word the moment it starts: while the host has not answered, the row says "pending",
// never a leftover success.
// The row costs a fit-content hug ZERO width (the tools row's shipped CSS trick) and its labels WRAP rather
// than clip: the whole message is the point of the tap, and the hover title says it exactly, as a button's does.
import { useContext, useRef, useState } from "react";
import { BlockActions, SENT_WORDS, type SendResult } from "../host/actions";
import type { FollowUp } from "./readBlocks";
import type { Align } from "./fields";
import { Icon } from "../lib/Icon";

// Which tap a host answer belongs to: only the LAST tap may put a word on the strip — and the moment a new
// tap starts, the previous word stops being true. A host that has not answered yet gets a pending mark, never
// the last tap's leftover success (a word is only ever said about the tap it answers).
const PENDING_WORD = "Pending…";

export function FollowUps({ items, place }: { items: FollowUp[]; place?: Align }) {
  const { send } = useContext(BlockActions);
  const [said, setSaid] = useState<SendResult | "pending" | null>(null);
  // Which tap a host answer belongs to: only the LAST tap may put a word on the strip.
  const taps = useRef(0);
  const cls = ["hb-followups"];
  if (place === "center") cls.push("hb-followups-center");
  if (place === "right") cls.push("hb-followups-right");
  return (
    <div className={cls.join(" ")}>
      {items.map((f, i) => (
        <button
          key={i}
          type="button"
          className="hb-pill"
          title={f.run}
          onClick={() => {
            const tap = ++taps.current;
            setSaid("pending");   // the old word was an answer to an OLDER tap — stale from this moment
            send(f.run, { force: true }).then((where) => {
              if (tap === taps.current) setSaid(where);
            });
          }}
        >
          <Icon name="spark" size={14} stroke={2.2} />
          <span className="hb-followup-label">{f.label}</span>
        </button>
      ))}
      <span className="hb-followups-said" role="status" aria-live="polite">
        {said === "pending" ? PENDING_WORD : said ? SENT_WORDS[said] : ""}
      </span>
    </div>
  );
}
