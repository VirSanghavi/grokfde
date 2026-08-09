# The demo video

Judged on **real world usefulness** and **technical complexity**. Those are two
different arguments and they need two different kinds of evidence:

- Usefulness is proved by a **stranger completing a real transaction**. Not a
  feature tour. One person walks in cold and ends up with a meeting on the
  calendar and a pull request open on their repo.
- Complexity is proved by **showing the machinery while it runs**, not by
  describing it afterwards. The working notes rail, the millisecond timings, the
  live GitHub read, the audio-driven mouth. Every one of those is on screen
  already, so the video just has to not cut away from them.

The single rule: **never say "and as you can see, this is a demo."** Everything
in the recording is the live product at grokfde.com. Say what it did, not what it
is meant to represent.

---

## Shape: 3 minutes, five shots

| # | Shot | Length | Proves |
|---|------|--------|--------|
| 1 | Cold open, the problem | 0:15 | Usefulness |
| 2 | Ask it something hard | 0:45 | Usefulness + complexity |
| 3 | Talk to it | 0:40 | Complexity |
| 4 | It opens a pull request | 0:40 | Usefulness + complexity |
| 5 | Book the meeting | 0:25 | Usefulness |
| — | Close | 0:15 | — |

If you only get 90 seconds, keep 2, 4, 5. Those are the three that a judge can
verify without trusting you.

---

## Shot 1 — Cold open (0:15)

**Record:** grokfde.com hero, scroll once, slowly, to the console. Nothing else.

**Say:**
> Every technical sale stalls in the same place. The buyer asks a real
> engineering question, and the answer takes three days because it has to go
> through an engineer who is already busy. This is that engineer, deployed.

Do not read the headline aloud. Do not narrate the scroll.

---

## Shot 2 — Ask it something hard (0:45)

**Record:** full screen, 1440 wide. Type into the console on the home page.
Use a genuinely hostile, specific question:

> We run a Django monolith on Heroku with Postgres and we need SOC 2. What
> would you do first?

**Do not cut.** Let it run. Three things happen on screen at once and they are
the whole pitch:

1. The **working notes** rail fills in with real timings: knowledge retrieval at
   ~0.5s, reasoning step count, first token at ~8s, memory updated, answer
   complete with a word count.
2. The answer **streams in**.
3. The **working memory** panel on the left fills itself in: Stage `Discovery`,
   Stack `Django / Heroku / Postgres`, and the pain point it inferred. Nobody
   typed those fields.

**Say, over the stream:**
> Nothing here is scripted. That rail on the right is the actual event stream:
> what it read, which tool it called, when the first token landed. And on the
> left it is building a customer record while it answers, so the call it takes
> tomorrow already knows this stack.

**Then hover the memory panel and say the one line that lands:**
> I never told it we run Django. It worked that out and wrote it down.

Ask a follow-up ("which of those would you do first?") to show the thread is
real and it remembers. Five seconds, no commentary.

---

## Shot 3 — Talk to it (0:40)

**Record:** click through to the engineer, start the voice call. Get the face
large in frame. Say something, then **deliberately talk over it mid-sentence**.

**Prove three things visually, no narration needed for the first two:**
1. The mouth tracks the audio in real time.
2. Barge-in: it stops the instant you cut in.
3. The transcript updates a line in place rather than posting a new message per
   fragment.

**Say, once, while it is talking:**
> Same memory as the chat. It is not reading a script, and the mouth is driven
> off the audio envelope in the browser, not a pre-rendered video loop.

Then one line of substance for the complexity score:
> Realtime WebSocket to xAI on an ephemeral client secret, 48 kilohertz through
> an audio worklet. The credential is minted per call and never touches the page.

---

## Shot 4 — It opens the pull request (0:40)

This is the shot that wins "real world usefulness," because it is checkable.

**Record:** scroll to the pull request section on the home page. It is read
**live from GitHub** on load, so the branch name, the file list, and the line
counts are whatever the API returns right now. Then click through to GitHub and
show the actual PR page. **Show the diff.** Then show the reply it posted on
issue 2.

**Say:**
> This is not a screenshot. That section reads the repository when the page
> loads. Eight files, seven hundred and eighty seven lines, on its own branch.
> It never pushes to main, it opens something a human reviews, and it validates
> before it does: protected paths untouched, no destructive deletes, imports
> resolve, the implementation matches the plan it wrote.

Be honest about the boundary, out loud. It is more credible, not less:
> It validates statically. It does not run your test suite yet. That needs a
> sandbox runner and it is the next thing.

---

## Shot 5 — Book the meeting (0:25)

**Record:** the availability section. Show that it is in **your** time zone and
that the count is real. Click a 3am slot on purpose. It lands on the booking page
with that exact slot already selected. Enter a name and an email. Confirm.

**Say:**
> Forty eight slots a day, because the engineer taking the meeting does not
> sleep. Pick one and it is booked, in your own time zone, no account.

If you can, cut to the confirmation and the join link. A meeting that exists is
the strongest possible ending.

---

## Close (0:15)

**Say:**
> A company shares one link. Their customers ask an engineer anything, at any
> hour, by text or by voice. It remembers each of them, it opens pull requests
> against the real repository, and it books its own follow ups. Grok FDE.

Last frame: grokfde.com. No feature list, no logo animation.

---

## Recording notes

- **1440x900, retina.** Do not record at 1920 and downscale, the type gets soft.
- **Cursor visible.** Judges want to see a person driving it.
- **No cuts inside shot 2.** The latency is the honesty. A cut looks like a
  splice and costs you the whole argument.
- **Real network.** No local dev server, no mocks. The URL bar should read
  `grokfde.com` in every frame.
- **Do a dry run of shot 4 an hour before recording** to confirm GitHub is
  reachable. That section has a designed error state and you do not want to
  discover it live.
- Do a **single take of the whole thing first** to find where it drags. The
  usual answer is shot 3.

---

## If you are asked hard questions

- **"Is it multi tenant?"** Every company gets a slug and a wildcard subdomain,
  and prospect sessions are scoped to the company. There is no
  user-to-company table yet, so the operator console pins one company rather
  than resolving per signed in user. Single tenant is solid; real isolation is
  the next piece.
- **"Does it run tests?"** No. It validates statically and labels the result
  "validated", not "passed", on purpose.
- **"What is actually yours versus the model?"** The realtime voice transport,
  the streaming agent loop with tool calls and memory extraction, the GitHub
  write path (blobs, tree, commit, ref) with a protected-path guard, the
  scheduling engine including a two pass wall-time-to-UTC conversion verified
  across 490,560 cases in 14 time zones, and the auth gate. The model writes
  prose and code; everything that makes it safe to point at a real repository is
  ours.
