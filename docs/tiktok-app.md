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

## Still missing — one thing

- [x] Terms of Service URL
- [x] Privacy Policy URL
- [x] Web/Desktop URL
- [x] Login Kit → Redirect URI
- [x] URL prefix verified (signature file, see below)
- [ ] **Demo video of the end-to-end flow, recorded against the sandbox**

The demo video is a REQUIRED field, and TikTok refuses to Save a form that
has any error — so the draft still cannot be persisted, and every field has
to be re-entered in one sitting once the video exists. This file remains the
copy of record.

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

## The four URLs

All four live on one static site, `marketalert-site`, served by GitHub Pages from a
**public** repo on the same account. The agent repo stays private; the site repo holds
nothing but four HTML files.

| Field in the portal | URL |
| --- | --- |
| Terms of Service URL | `https://malkaofir-code.github.io/marketalert-site/terms.html` |
| Privacy Policy URL | `https://malkaofir-code.github.io/marketalert-site/privacy.html` |
| Web / Desktop URL | `https://malkaofir-code.github.io/marketalert-site/` |
| Login Kit Redirect URI | `https://malkaofir-code.github.io/marketalert-site/callback.html` |

TikTok verifies a URL property one of two ways: a DNS TXT record on a domain you own, or a
**signature file** served under a URL prefix you control. `github.io` is not our domain, so
DNS is out; the signature file is the route. TikTok hands over a file named
`tiktokXXXXXXXXXXXX.txt` — it goes in the site repo root, and the verified prefix is
`https://malkaofir-code.github.io/marketalert-site/`, which covers all four URLs above.

Pages cannot be enabled on `market-agent` itself: *"Upgrade or make this repository public
to enable Pages"*. Hence the separate public repo.


## Site: live

`malkaofir-code/marketalert-site` — public, GitHub Pages from `main` / root.
Live and serving. The signature file
`tiktokzBVQRkcdCXCU3GjeRocxpzei06p5FuRv.txt` sits in the repo root and TikTok
reports the prefix **verified**, which covers all four URLs.

## The form, re-entered and then lost

Every field below was entered and accepted; only the demo video was missing,
and Save was refused, so nothing persisted. Re-enter in this order:

1. App icon → `src/assets/brand/app-icon.png`
2. App name → `marketalert.il`
3. Category → **Finance**
4. Description → the 111-character line above
5. Terms / Privacy URLs → as tabled above
6. Platforms → **Web**, then Web/Desktop URL
7. App review explanation → the 975-character text below
8. Products → **Login Kit** first, then **Content Posting API**
9. Login Kit → Redirect URI
10. Content Posting API → **Direct Post** toggle on (this is what adds
    `video.publish`)
11. Demo video → upload, then Save, then Submit

The app-review text had to be cut from 1114 to 975 characters — the limit is
1000, and the portal does not say so until you paste.
