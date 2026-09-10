# Reel — the line of truth

Fourteen rules the next reel has to pass. Each says what to do, why it is
true, and how to check it, because a rule you cannot test is a preference.

The account has 61 followers and its problem is reach, not retention. In
2026 Instagram ranks on **sends per reach** — how many people DM the post
to somebody — and likes are publicly de-weighted to near nothing. So the
question every card answers is not "is this interesting" but "would one
person forward this to another person". Everything below follows from that.

## A · What the reel is for

**01 · Build for the forward, not the like.** Every reel ends with a reason
to send it to a specific person, phrased as a situation rather than a
demand. Not "שתפו" — closer to "שלחו למי שמחזיק נאסד״ק". Engagement bait is
separately down-ranked, so the ask has to be contextual to work at all.
TEST: read the last card alone. Does it name a kind of person the viewer
knows? "Follow" fails.

**02 · One a day, same time, forever.** 17:00 local. Two a day split the
same small audience and teach the ranker that neither held anyone. A fixed
slot is also the only way rule 14's numbers mean anything.
TEST: `REEL_HOURS='17'`, `MAX_REELS_PER_DAY='1'`.

## B · The first three seconds

**03 · Open on the day's biggest number, not on your own name.** No
masthead card, no logo, no "היום בשוק". A branded title card spends the
highest-leverage second telling a stranger something they did not ask
about, and repeats the account name Instagram is already drawing.
TEST: `slide[0].headline` contains a figure.

**04 · Nothing fades in.** Frame one is the finished card, already moving.
TEST: scrub to 0:00 — the headline must be fully legible.

## C · It is read, not heard

**05 · Mute is the design brief.** Text carries one hundred percent of the
meaning; audio is atmosphere. The "85% watch on mute" figure is quoted
everywhere and attributable to nobody, so this does not rest on it — the
reel has no voice, which makes the rule absolute rather than statistical.
TEST: watch muted. Anything you only understood from audio is a bug.

**06 · One idea per card, nine Hebrew words at most.** If a headline needs
a comma and a clause to survive it is two cards, or it is trimmed.
TEST: `headline.split(/\s+/).length <= 9`.

**07 · Three seconds a card, minimum.** Silent cards are held by reading
time. 2.0 was the floor under a spoken line, where the voice set the pace.
TEST: `REEL_HOLD_SEC='3.0'` — seven cards ≈ 19.9s.

## D · The frame

**08 · Keep every word out of the bottom quarter and the right edge.** On
1080×1920: nothing readable below ~y=1440, nothing in the right ~130px.
Caption and audio attribution sit across the bottom, the action buttons up
the right. The mascot may stand there; he is not information.
TEST: screenshot a card, overlay the real UI, check only Ron is underneath.

**09 · One accent per card, and it is always the number.** Direction —
green up, red down — is semantic and separate from the accent. Two accents
point at nothing.
TEST: count coloured elements per card. One, plus the candles behind.

## E · Length

**10 · Eighteen to thirty seconds — the shortest that lands the day.** The
benchmarks want >45% completion at 15–30s and >55% under 15s. Advice going
around says educational reels should run 45–60s; that is written for
accounts that already have an audience, where saves matter more than reach.
This account needs strangers to finish, so it takes the shorter side and
revisits when rule 14 has data.
TEST: `built.seconds` in [18, 30]. Outside it, cut beats — never holds.

## F · Truth

**11 · Every number traces to a message the source actually sent.** No
rounding, no recalculating, no converting. This account published
`SPX +46.06%` once, out of stale carry rows and a comma read as a decimal
point. Every guard exists because of that afternoon.
TEST: the number guard — every digit in a generated line already appears in
the Hebrew source.

**12 · Never state a relationship the source did not draw.** "Also" and
"Meanwhile" claim only that both things happened. "Because", "despite",
"which sent", "on the back of" are claims about the market nobody verified.
TEST: search the deck for causal words not present in the Hebrew.

**13 · When it cannot be made accurate, it is dropped — not approximated.**
A card that fails a guard is silent or absent, never a vaguer version of
the same claim. Silence costs a beat; a confident wrong figure costs the
only thing the account is selling.
TEST: a rejection appears in the log naming the guard that caught it.

## G · Measurement

**14 · Judge a reel on sends and completion. Never on views.** Two numbers:
`shares ÷ reach` and `avg watch time ÷ length`, recorded beside the choices
that produced them. Views measure what the ranker did, which is the output
you are trying to change.
TEST: after 30 days there are enough rows to rank openings by spread_pct.
Until then no format change is evidence-based — and should say so.

## Δ Compliance

| Rule | State |
|---|---|
| 01 send cue | closes on a rotating situation ask — `שלחו לחבר שעוקב אחרי השוק` |
| 02 one a day at 17:00 | `REEL_HOURS='17'`, `MAX_REELS_PER_DAY='1'` |
| 03 open on the number | card 1 is the day's biggest **move**, and its story is card 2 |
| 04 nothing fades in | two-plane push-in starts at full opacity |
| 05 silent | `REEL_VOICE='0'`, translation off with it |
| 06 nine words | `fitCard()` — first clause, else a cut that drops dangling conjunctions |
| 07 three seconds | `REEL_HOLD_SEC='3.0'` — seven cards, 19.9s |
| 08 safe area | `node tools/safe-area.mjs` — all text clear of the UI rectangles |
| 09 one accent | the figure carries it; direction is separate |
| 10 18–30s | 19.9s |
| 11–13 truth | number guard, no causal connectives, drop rather than approximate |
| 14 measurement | `shares ÷ reach` recorded per reel; needs 30 days |

Two things rule 3 forced that were not obvious. The lead must be a
**move**, not merely the largest number — the first build opened on
`מכסים 25%`, a tariff *rate*, which presents a level as the day's
change and is the exact register this account exists not to lie in.
And the lead story is promoted to card 2, so the hook is paid off
immediately rather than four cards later.

Rule 8 was the one that could only be settled by measuring. Every
headline this account has published started at y=132, and Instagram's
top bar covers the first ~150px — eighteen pixels of every headline,
under the chrome, invisible in every render anyone ever looked at.
`tools/safe-area.mjs` puts the UI rectangles over the page and
measures the text boxes against them. Run it after any layout change.

## What is weak here

The ranking-signal claims are second-hand summaries of Mosseri's public
statements, not direct quotes. No source gives exact safe-zone pixel
counts; rule 8's numbers are a consensus of several guides and want
verifying against a real screenshot. Rules 1–14 are a starting position,
not a finding. Rule 14 is how they stop being one.

Sources: socialync.io/blog/adam-mosseri-shares-instagram-algorithm-2026 ·
influencermarketinghub.com/instagram-sends-per-reach-playbook ·
retensis.com/blog/good-instagram-reels-retention-rate ·
moonb.io/blog/instagram-reel-length · kreatli.com/guides/instagram-reels-safe-zone
