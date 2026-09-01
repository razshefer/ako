# Getting it onto your phone, for good

## The short version

Reps is a PWA. **Once installed, it runs entirely from your phone's storage** —
no network, no laptop, no server. You can be on a plane.

The catch is the *first* install. A phone will only cache an app for offline use
if the page was served over **HTTPS**. That is a browser rule, not a choice this
app makes. `python serve.py` gives you `http://192.168.x.x:8080` — plain HTTP on
an address that only exists while your laptop is awake — so the phone refuses to
install it as an app.

So the whole job is: **get it on an HTTPS URL once.** Install from there, and the
phone never needs that URL again except to pick up updates. Even if the host
disappears entirely, the installed app keeps working.

Pick one of the two options below. Both take a few minutes, once.

---

## Option A — GitHub Pages

Free, permanent, and every `git push` becomes a deploy. The workflow in
`.github/workflows/pages.yml` validates the content packs and then publishes.

> **The repo has to be public.** GitHub Pages on a *private* repo requires a paid
> plan (Pro/Team/Enterprise). On the free plan, Pages only serves public repos.
> There is nothing sensitive here — it is learning content and no progress data
> ever leaves your phone — but if you would rather not publish it, use option B.

1. Create an empty **public** repo on GitHub, e.g. `reps`. Do not add a README.

2. Point this repo at it and push:

```bash
git remote add origin https://github.com/<you>/reps.git
```

```bash
git branch -M main && git push -u origin main
```

3. In the repo on github.com: **Settings → Pages → Build and deployment →
   Source: GitHub Actions**.

4. Go to the **Actions** tab. The `Deploy to GitHub Pages` run should be green.
   If it did not start, push once more or run it manually with *Run workflow*.

5. Your URL is:

```
https://<you>.github.io/reps/
```

6. Open it **on your phone**, then:
   - **Android / Chrome**: ⋮ menu → *Add to Home screen* (or *Install app*)
   - **iPhone / Safari**: Share → *Add to Home Screen*

That icon is now a real app. Turn off your laptop, put the phone in airplane
mode, open it — it works.

---

## Option B — your own cluster

You run RKE2 clusters with Rancher and an ingress controller. This is a static
site; serving it is a 60-line manifest, and it stays private to your network.

This repo ships `Dockerfile`, `deploy/nginx.conf` and `deploy/kubernetes.yaml`.

```bash
docker build -t harbor.internal/platform/reps:1 . && docker push harbor.internal/platform/reps:1
```

Edit `deploy/kubernetes.yaml` — set the image, the host and your TLS secret —
then:

```bash
kubectl apply -f deploy/kubernetes.yaml
```

The one thing that actually matters: **the certificate must be one your phone
trusts.** A public cert (cert-manager + Let's Encrypt) just works. An internal CA
works too, but only if that CA is installed on the phone — otherwise Safari and
Chrome will refuse to register the service worker and you lose offline mode
without any obvious error.

The manifest is a reasonable template rather than a demo: two replicas, a PDB
with `maxUnavailable: 1` (not `minAvailable: 2`, which would block your next node
drain), a read-only root filesystem, and no CPU limit.

---

## Option C — drag and drop, no git

If you want a URL in about 30 seconds and do not care where it lives:

- **Netlify**: sign in, go to <https://app.netlify.com/drop>, drag the `reps`
  folder onto the page. You get an HTTPS URL immediately.
- **Cloudflare Pages**: Workers & Pages → Create → Pages → Upload assets.

Both can also connect to a GitHub repo later for push-to-deploy.

---

## Verifying the phone is actually independent

Worth doing once, so you know it worked:

1. Install to the home screen from your HTTPS URL.
2. Open it from the icon and use it for a few seconds.
3. Put the phone in **airplane mode**.
4. Open it again from the icon.

If it loads and you can answer questions, you are done — it is running from the
phone. If it shows a "Content failed to load" screen instead, the service worker
did not register: almost always because the page was served over HTTP, or over
HTTPS with a certificate the phone does not trust.

## Updating later

```bash
python tools/validate.py
```

Then push (option A), rebuild and roll the image (option B), or re-drag the
folder (option C). The phone picks up the new version the next time it is opened
with a connection.

If a change seems not to land, fully close the app (swipe it away from the app
switcher, not just background it) and reopen it. That lets a waiting service
worker take over.

## What is stored where

- **The app and its content**: cached on the phone by the service worker. App
  files cache-first; content JSON network-first, so edited packs appear without
  bumping a version.
- **Your progress**: `localStorage` on the phone only. It never goes to the host,
  to GitHub, or anywhere else.
- **Moving to a new phone**: Settings → Backup & restore → *Download backup* on
  the old phone, *Restore from box* on the new one. There is no sync.

## Local development

`python serve.py` is still the right tool for editing content — it prints a LAN
URL and serves everything no-cache. Just do not expect the offline install to
work from it, for the reason at the top of this file.
