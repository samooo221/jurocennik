# Access & safety — Parts Advisor for the shop

## 1) Give me repo access

Find where the code is: **Vercel → project → Settings → Git** (shows the repo + provider), or run
`git remote -v` in the project folder.

Grant access — my GitHub username is **samooo221**:
- **GitHub:** repo → Settings → Collaborators → Add `samooo221`, role **Write**
  (or keep it read-only: I fork and send PRs for you to approve)
- **GitLab:** Members → Invite `samooo221`, role **Developer**
- **Bitbucket:** Settings → User access → Add `samooo221`, **Write**

Also:
- **Vercel → Settings → Members → invite me** (or being a repo collaborator is enough — Vercel
  auto-builds a preview for my branch)
- Add env var **`GROQ_API_KEY`** (for the AI advisor) in Vercel → Settings → Environment Variables,
  scopes **Preview + Production**. I'll send the key (free).
- Send me the **`.env.local`** values needed to run the site locally (Sanity, Clerk, etc.)

**Bottom line: repo access + the `.env.local` values to run it locally.**

## 2) Your live site stays safe

- I never touch `main` (your live site). I work on a **separate branch** — production stays exactly as it is.
- My branch gets its own **private Vercel preview URL** — a sandbox, separate from the real shop.
- Changes are **additive only** (one new page, a component, a data file, one menu link). I don't edit
  your products, pages, or checkout.
- It only **reads** a fixed parts list and sends an enquiry email — never writes to your database,
  Sanity, or payments. It can't break or change anything.
- **You're the gate:** I open a Pull Request, you review the exact changes, and **only you merge**.
  Nothing goes live until you approve.
- **Instant rollback** anytime — Vercel keeps every previous version (one click) and git keeps full history.

Optional: turn on **branch protection** for `main` so nothing merges without review.
