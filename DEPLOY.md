# Getting it onto your phone, permanently

The goal: the app lives somewhere your phone can always reach, so your laptop can
be off, asleep, or in another country.

Once installed as a PWA it also works **fully offline** — the service worker
caches the app and its content on the phone. Hosting is only needed for the
first install and for updates.

## Option 1 — GitHub Pages (recommended)

Free, no account beyond GitHub, and it redeploys every time you push content.
This repo already contains `.github/workflows/pages.yml`, which validates the
content packs and then publishes.

1. Create an empty repo on GitHub. **Private is fine** — Pages works on private
   repos for personal accounts on the free plan; if yours does not, make it public
   (there is nothing sensitive here) or use option 2.

2. Push:

```bash
git remote add origin https://github.com/<you>/reps.git
```

```bash
git branch -M main && git push -u origin main
```

3. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

4. Push once more (or run the workflow manually from the Actions tab). Your URL
   will be:

```
https://<you>.github.io/reps/
```

5. Open that on your phone → **Add to Home Screen**. Done. It is HTTPS, so the
   service worker installs and offline mode works on iOS as well as Android.

From then on, `git push` is a deploy. The phone picks up the new version next
time it is opened with a connection.

## Option 2 — Netlify or Cloudflare Pages, drag and drop

No CLI, no git required.

- **Netlify**: sign in, go to <https://app.netlify.com/drop>, drag the `reps`
  folder onto the page. You get an HTTPS URL immediately.
- **Cloudflare Pages**: Workers & Pages → Create → Pages → Upload assets.

Both also support connecting the GitHub repo instead, which gives you the same
push-to-deploy behaviour as option 1.

## Option 3 — a machine you already run

You are an SRE with clusters. If you would rather self-host, it is a static
folder — any of these work:

```bash
docker run -d --name reps -p 8080:80 -v "$PWD:/usr/share/nginx/html:ro" nginx:alpine
```

Or as a Deployment on a cluster you already run, behind your existing Ingress.
The only requirement worth remembering is **HTTPS**: iOS will not register a
service worker over plain HTTP, so without TLS you lose offline mode on iPhone
(Android is fine on a LAN address).

## Option 4 — local only

`python serve.py` still works and prints a LAN URL for the phone. Fine for
testing, but the laptop has to be on and on the same network — which is exactly
what the options above avoid.

## Updating content later

Whichever option you pick, the loop is the same:

```bash
python tools/validate.py
```

then commit and push (or re-drag the folder). Content is fetched at runtime, so
adding a subject never needs a rebuild.

## Notes on the offline cache

- `sw.js` caches the app shell **cache-first** and content JSON **network-first**,
  so edited packs show up without bumping a version.
- If a change ever seems not to land on the phone, close all tabs of the app and
  reopen it; that lets a new service worker take over.
- Progress is stored in the phone's `localStorage` and never leaves the device.
  Moving to a new phone means Settings → Backup & restore → *Download backup* on
  the old one, and *Restore from box* on the new one.
