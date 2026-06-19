# Tracking Stack

Self-hosted server-side tracking for Meta Ads, GA4, and Google Ads. Replaces
Stape and GTM Server-Side for paid-traffic creators running lead-capture forms
and sales pages.

**Version**: see `VERSION`

## What you get

- **First-party cookies** that survive Safari ITP (400-day server-set from the edge).
- **Server-side conversion events** to Meta CAPI, GA4 Measurement Protocol,
  and Google Ads API — no loss from ad-blockers, no dependence on the pixel.
- **Full attribution persistence** (UTMs, `fbp`/`fbc`, `gclid`) captured at
  the edge and threaded through to each lead and each purchase.
- **Sales platform webhooks** for Eduzz, Hotmart, and Kiwify out of the box.
- **A built-in dashboard** showing leads and purchases with their original
  UTMs so you can see where conversions actually came from.
- **Runs entirely in your own Cloudflare account.** No external services, no
  SaaS subscriptions, no shared backend.

## Who this is for

Creators running paid traffic to lead-capture or sales pages. You have (or can
get) your own Meta Ads account, GA4 property, and optionally Google Ads. You
want the tracking quality of Stape or a GTM Server container without the
monthly cost or the DevOps.

This is **not** for you if:

- You don't run your own ad accounts.
- You need a hosted SaaS product — this runs in *your* Cloudflare account, not
  ours.
- Your sales platform isn't Eduzz, Hotmart, or Kiwify and you're not willing
  to let Claude Code help you add a new one (it's a guided 15-minute procedure
  — see `docs/platforms/_template.md`).

## What you need before you start

- **A Cloudflare account.** The free tier is enough to start. You'll create a
  Pages project and a D1 database inside it.
- **A GitHub account**, with the `gh` CLI installed and authenticated
  (`gh auth login`). Cloudflare Pages deploys your stack by auto-pulling from
  GitHub every time you push.
- **Node.js** so `npx wrangler@latest` works (no global install needed).
- **Claude Code installed.** This entire stack is designed to be deployed and
  managed through Claude Code — you will not need to write any code yourself.
- **Meta Business Manager**: a Pixel ID and a Conversions API access token.
- **GA4 (optional)**: a Measurement ID (`G-XXXXXXXXXX`) and a Measurement
  Protocol API secret. Skip if you don't plan to use GA4.
- **Google Ads (optional)**: developer token, OAuth credentials, and at least
  one conversion action ID. Skip this if you don't run Google Ads.
- **A sales platform account** if you're building a sales page (Eduzz,
  Hotmart, or Kiwify). Each needs a way to generate a webhook secret in its
  own dashboard.

## How to set up

1. Unpack this folder somewhere on your computer.
2. Open that folder in **Claude Code**.
3. Say: **"set up my tracking"**. Claude Code invokes the `deploy-stack`
   skill, which creates your D1 database via `wrangler`, spins up a fresh
   private GitHub repo and pushes the code, then walks you step by step
   through the Cloudflare dashboard — creating the Pages project, binding
   the D1, and adding your environment variables. Expect about 30 minutes
   end-to-end.
4. When it finishes, say: **"check my tracking is working"**. Claude Code will
   invoke the `verify-tracking` skill and walk you through the 6-step
   integrity verification so you know every link in the chain is wired up
   before you point real traffic at it.
5. To add your first lead form or sales page, say: **"add a lead page"** or
   **"add a sales page"**. Claude Code will copy the right starter template
   and wire it to the tracking endpoints.

## What's inside

| Directory | Purpose |
|---|---|
| `functions/` | Cloudflare Pages Functions — middleware, endpoints, webhook handlers |
| `migrations/` | D1 database schema (applied during setup) |
| `dash/` | The built-in dashboard (self-contained HTML) |
| `examples/` | Starter HTML pages for lead forms and sales pages |
| `docs/` | Reference documentation you can read if you're curious |
| `.claude/skills/` | Claude Code skills that automate setup, verification, and extension |
| `config/` | Per-product configuration (you edit one JSON file) |

## Support

<!-- TODO: fill in support channel (Slack? forum? email?) before launch -->

## License

<!-- TODO: decide license before launch -->
