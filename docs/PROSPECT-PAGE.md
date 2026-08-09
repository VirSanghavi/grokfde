# The prospect page

One page. No account. No navigation. This is the entire customer-facing product.

A company shares exactly one link, `acme.grokfde.com` (or `/fde/acme`), and whoever
opens it is talking to that company's engineer within one second of arriving.

## The rule

Everything happens on this page. Chat, history, context, and the live voice call are
all states of one surface, never separate routes. A visitor never navigates, never
signs up, never sees a loading page between them and the engineer.

## Identity without accounts

The visitor is anonymous but persistent. A prospect id is minted on first visit and
kept in `localStorage`, scoped per company slug so two companies never share one
identity. Returning with that id restores their thread and everything Atlas learned.

Clearing storage means starting fresh, and that is acceptable. Never gate the page
behind an email prompt. Ask for identity only when the visitor wants something that
genuinely needs it, such as an emailed summary or a booked call, and ask inline.

## Anatomy, top to bottom

**Header.** Company name and mark, the agent's name, and one live status pill. The
pill is the only vermilion on the page while idle, and it states something true:
"Atlas is online" when idle, "Atlas is listening" or "Atlas is speaking" during a
call. Never a decorative pulsing dot.

**The prompt box.** The visual and functional center of the page, and the first thing
the eye lands on. Large, quiet, unmistakably a place to type. Placeholder names the
company concretely, for example "Ask Atlas about Acme's API, pricing, or security."

It is a real composer: multiline, Enter sends, Shift+Enter newlines, autofocus on
desktop and NOT on mobile (autofocus there yanks up the keyboard and hides the page).
Disabled only while a send is in flight, and it never loses what was typed.

Directly beneath it, three or four suggested openers generated from the company's
actual knowledge, not hardcoded. They exist to answer "what can I even ask this
thing" and they disappear permanently once the conversation starts.

**Start a call.** A persistent, equal-weight secondary action next to the prompt box:
"Talk to Atlas" or "Start voice call". This is the moment the product sells itself, so
it must be reachable at all times, including mid-conversation, and it must carry the
conversation's full context into the call.

**The thread.** Once the first message is sent, the conversation grows in place and
the prompt box docks to the bottom. Assistant text streams in token by token; a
visitor must never watch a spinner where prose should be. Tool calls and knowledge
lookups appear inline as compact, honest activity lines as they happen, because
watching the engineer actually look something up is the proof it is not a scripted
demo. Show what it did, never a fake "thinking" animation.

**Previous conversations.** If the visitor has prior threads, list them compactly with
the date and a real one-line summary of what was discussed, not the raw first message.
Selecting one loads it in place. This is where continuity becomes visible, so it
deserves real design rather than a nav list, but it must not compete with the prompt
box on first paint.

**What Atlas knows.** A quiet, honest panel of the memory built so far: stack,
requirements, objections, open questions, next step. Only render fields that actually
have content. An empty memory panel renders as nothing at all, never as a grid of
empty labels. This panel is the single clearest proof that this is not a chatbot.

## The call

Full-viewport takeover, one of only two earned dark surfaces. Everything in
`docs/VOICE-PROTOCOL.md` applies, in particular: transcripts arrive cumulatively via
`.updated` and must replace rather than append, barge-in must flush queued audio, and
the mouth is driven by the audio RMS envelope rather than the transcript.

The call carries the chat context in and writes the transcript and learned facts back
out, so ending the call returns the visitor to the same page with the thread and
memory visibly updated. That round trip is the whole product story and it must be
visible, not silent.

Tool calls during the call surface in real time on the stage. Anything the agent does,
the visitor sees.

## Four states, on every part

The prompt box is usable before anything else has loaded; the page must never block
input on a fetch. History and memory each get their own skeleton, honest empty, and
error with retry. A failed company lookup renders a real designed page explaining that
no engineer is published at this address, never an unhandled rejection and never an
infinite spinner.

## Mobile

This page will be opened on a phone in an office lobby, so mobile is the primary
design target, not the fallback. The prompt box sits above the fold at 375px. The
composer stays reachable above the keyboard. Tap targets are 44px. Nothing scrolls
horizontally. The call surface is flawless in portrait.
