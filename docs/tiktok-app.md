# TikTok app — submission notes

App: **marketalert.il** · id `7686464640482445320` · Production draft.

Everything below is already entered in the developer portal form. TikTok
refuses to SAVE a form that still has errors, so until the four URL fields
are filled the draft lives only in the open browser tab — this file is the
copy that survives.

## Entered

| Field | Value |
|---|---|
| App name | marketalert.il |
| Category | Finance |
| Icon | `src/assets/brand/app-icon.png` (1024×1024, the account's mark) |
| Platforms | Web |
| Products | Login Kit · Content Posting API |
| Direct Post | on — which is what adds the `video.publish` scope |
| Scopes | `user.info.basic` · `video.publish` · `video.upload` |

Description (111/120):

> Posts our own short daily videos about the US stock market, in Hebrew, to
> our own TikTok account on a schedule.

## Still missing — all of it needs ONE verifiable domain

TikTok verifies a URL two ways: a **DNS record** on a domain you own, or a
**signature file** served under a URL prefix you control. A page we do not
control the host of can never be verified, so the policy pages have to move
to whatever domain we pick.

- [ ] Terms of Service URL
- [ ] Privacy Policy URL
- [ ] Web/Desktop URL
- [ ] Login Kit → Redirect URI
- [ ] Demo video of the end-to-end flow, recorded against the sandbox

Domain verification for `pull_by_url` is deliberately NOT needed: the
publisher will use `FILE_UPLOAD` and push the mp4 straight from the runner,
so no media URL is ever fetched from a domain.

## App review explanation (entered)

Market Alert is our own publishing tool. It makes short daily videos in
Hebrew about the US stock market and posts them to our own TikTok account on
a schedule. It is not offered to the public and has no other users.

Login Kit with user.info.basic: used once, by us, to connect our own TikTok
account to the tool. We read only open_id and display name, to confirm the
connection is to the right account and to store the token against it. No
other profile data is read and no other account can connect.

Content Posting API with video.publish: the tool renders a finished MP4 on a
server, then posts it directly to that same account with Direct Post.
Privacy is set to PUBLIC_TO_EVERYONE, and the video is uploaded with
FILE_UPLOAD from our own server, so no domain URL is pulled. Each post
carries a Hebrew caption written by us. Roughly one to three videos a day.

video.upload is included with the product; we use Direct Post, not drafts.

All content is our own: we write it, render it and own it. Posts summarise
publicly reported market news and state that they are information rather
than investment advice.
