# Giving me access to the shop — and keeping your site safe

Hi Juraj 👋 — to add the **parts advisor** to your shop's *Náhradné diely* section, I need access to
the site's code. This explains **(1)** how to give me that access (and how to find where the code
lives), and **(2)** exactly how your live shop stays completely safe while I work in it. Your
developer can do the steps in part 1 in a few minutes.

---

## 1) How to give me access to the repo

**First — where does the code live?** The shop runs on **Vercel**, and Vercel always deploys from a
connected Git repository, so the code is definitely hosted somewhere. Two ways to find out where:

- **Vercel → your project → Settings → Git** — it shows the connected repository and provider
  (e.g. `github.com/owner/repo`, or GitLab / Bitbucket). This is the definitive answer.
- Or, in the project folder on the dev's computer: run `git remote -v` — the URL tells you the host
  (`github.com…`, `gitlab.com…`, `bitbucket.org…`, or a private/self-hosted server).

**Then grant me access.** My GitHub username is **`samooo221`**.

| If the repo is on… | Do this |
|---|---|
| **GitHub** | Repo → **Settings → Collaborators → Add people → `samooo221`**, role **Write**. *(Or keep it read-only: I fork it and send Pull Requests for you to approve.)* |
| **GitLab** | Project → **Manage → Members → Invite member** (my username/email), role **Developer**. |
| **Bitbucket** | Repository **Settings → User and group access → Add `samooo221`**, **Write**. |
| **Self-hosted / other** | Add my account or my SSH key as a contributor. |

**Two more small things so I can test on a real URL and the AI part works:**

- In **Vercel → Settings → Members**, invite me too — *or* it's enough that I'm a repo collaborator,
  because Vercel automatically builds a private preview for my branch.
- Add one new secret, **`GROQ_API_KEY`** (for the AI advisor), in
  **Vercel → Settings → Environment Variables** under the **Preview** and **Production** scopes.
  I'll send you a free key for this — it costs nothing.

To actually run the site on my own machine while building, I'll also need the **`.env.local`** values
the project uses to start (Sanity, Clerk, etc.) — your dev can share those, or a safe dev copy.

**That's the whole ask: repo access + the env values to run it locally.**

---

## 2) How your live shop stays safe while I work

Short version: **I never touch your live site. I work on a separate copy (a "branch"), and nothing
reaches the real shop until you approve it.** In detail:

1. **Your live shop runs from the `main` branch — I don't go near it.** I create a separate branch
   (e.g. `feature/parts-advisor`). Your production site stays exactly as it is the entire time.
2. **My branch gets its own private preview URL** from Vercel (a temporary `…vercel.app` address).
   I build and test there — it's a sandbox, completely separate from the real shop.
3. **My changes only *add* things — they don't rewrite yours.** A new page, a component, a small data
   file, one menu link. I'm not editing your existing products, pages, or checkout.
4. **It can't harm your data.** The advisor only *reads* a fixed parts list and sends an enquiry
   e-mail. It never writes to your database, Sanity, or payments — even the preview can't change or
   break anything.
5. **You're the gate.** When it's ready, I open a **Pull Request**: you (or your dev) see exactly what
   changed and **only you merge it**. Until you click merge, the live shop never sees it.
6. **Instant undo, always.** Even after going live, Vercel keeps every previous version — one click
   restores it — and Git keeps the full history. Nothing is ever lost.

So the worst possible case is "the preview looks wrong on its own test URL" — your real shop keeps
running untouched, and **you** decide if and when anything goes live. For extra peace of mind, your
dev can switch on **branch protection** for `main` so nothing can merge without a review.

---

Thanks for trusting me with this — the process above means that trust is backed up by the tools, not
just good intentions: I *can't* affect the live shop without your explicit approval. 🙏

— Samuel
