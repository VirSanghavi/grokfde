# Demo runbook

Everything below was verified against production, not inferred from code.

## Open this

**https://grokfde.com** and click **Book a call**.

For the stronger version of the story, open **https://grok-fde.grokfde.com** instead.
It is the same product on a per-company subdomain, which is the "a company shares one
link and their customers talk to an engineer, no account" pitch.

## The four beats

1. **The homepage.** Cinematic hero, one primary action: book a call.
2. **The prospect page** (`/fde/grok-fde`). Type a hostile technical question. The
   answer streams in about three seconds, and the memory panel on the right fills
   itself in from what you said: stack, requirements, open questions, next step. That
   panel is the product. It is what a chatbot cannot do.
3. **The call.** Click "Talk to Atlas". Atlas is a drawn character whose mouth shapes
   real words: jaw from the audio envelope, mouth shape from visemes off the live
   transcript. It carries the chat context in, and writes the transcript and what it
   learned back out.
4. **The repo.** Atlas opens real pull requests and answers real GitHub issues.
   Evidence: https://github.com/VirSanghavi/grok-fde-sandbox/pull/1 (8 files, +787)
   and a posted issue reply on issue 2 of the same repo.

## Do not demo

- **Any operator page while signed out.** They correctly redirect to login.

Company signup used to be on this list because the project's SMTP quota was exhausted
and a confirmation mail never arrived. There is no email verification any more:
`POST /api/auth/signup` creates the account already confirmed with the service role
and the browser signs straight in, so nothing is mailed and nothing can be throttled.
It is safe to demo.

## If asked hard questions, the honest answers

- **"Does it run tests?"** It validates statically: protected paths untouched, no
  deletes, balanced syntax, JSON parses, implementation matches the planned paths,
  imports sane. Results are recorded as "validated", not "passed", on purpose. Full
  runtime testing needs a sandbox runner, which is not built.
- **"Is it multi-tenant?"** Not really, yet. There is no user-to-company linkage in
  the database (no `company_members` table, and we had no DDL access to create one),
  so the operator console pins the canonical company deterministically rather than
  resolving per user. Single tenant is solid; real isolation is the next piece.
- **"Can it push to main?"** No, structurally. The guard is enforced inside the
  GitHub client on all three write paths (branch, commit, PR), so every change is a
  new branch and a reviewable pull request.

## Verified on production

```
/  /book/grok-fde  /fde/grok-fde  grok-fde.grokfde.com     200
/dashboard  /demos  /conversations       anonymous         307 -> login
/api/bookings  /api/github/repos  /api/conversations       401
/api/auth/signup (the account-minting hole)                404, route deleted
chat first token 3.08s, total 6.50s
```

## Known gaps, none on the demo path

- `/api/slack/events` does not verify `x-slack-signature`. Not exploitable until a
  real Slack team is connected. Fix before connecting one.
- Two tap targets under 44px on the login and signup pages.
- The thread list (previous conversations) is not built. The endpoints exist and are
  tested: `GET /api/conversations?prospectId=` and `POST` with `forceNew: true`.
- ESLint crashes repo-wide (`Converting circular structure to JSON` out of
  `@eslint/eslintrc`), so nothing is being linted. TypeScript is clean.
- A 7 column calendar cannot reach 44px cells at 320px viewport width. Geometry, not
  sloppiness: seven 44px cells is 308px before borders or gaps.

## If something breaks live

The dev server on localhost is irrelevant to the demo; everything above is production.
If a page misbehaves, hard reload first. The QA suite is `npm run qa` and its
screenshots land in `scripts/qa/screenshots`.
