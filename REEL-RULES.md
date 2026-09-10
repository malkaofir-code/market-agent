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

## Δ What this still owes

| Rule | Today | Required |
|---|---|---|
| 03 open on the number | card 1 is "היום בשוק" + the tape strip | card 1 becomes the day's biggest move |
| 01 send cue | closes on "עוקבים לעוד", a follow ask | closes on a situation-based send ask |
| 06 nine words | headlines pass through at source length | cap enforced in compose |
| 07 three seconds | was 2.0 under the voice | 3.0 — done |
| 05 silent | narration + translation ran every build | `REEL_VOICE='0'` — done |
| 08 safe area | never verified against the real UI | one screenshot check |

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
