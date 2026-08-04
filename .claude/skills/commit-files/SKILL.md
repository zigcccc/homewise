---
name: commit-files
description: How to commit work when the user asks to "commit", "commit in meaningful chunks", or "commit and open a PR". Use whenever committing staged or unstaged work.
---

# Committing files

Committing is bookkeeping. It should take a couple of minutes, not half an hour.

## "Meaningful chunks" means by app or package

Split on the boundaries that already exist in the repo: `apps/server`, `apps/web`, `apps/e2e`,
`packages/ui`. That's it. The existing history on any branch shows the shape — usually a
`feat(server)` / `feat(web)` / `test(e2e)` run.

```bash
git add apps/server && git commit -m "feat(server): ..."
git add apps/web    && git commit -m "feat(web): ..."
git add apps/e2e    && git commit -m "test(e2e): ..."
```

One commit per app is the default. Two commits for one app is fine when it holds two genuinely
unrelated changes and the files don't overlap. Server and web belong together in one commit when
the RPC contract couples them — a response shape changing on one side won't compile on the other.

**Never** reconstruct history that didn't happen. No stashing, no `git add -p`, no authoring
intermediate versions of a file to slice one file across several commits, no `reset --soft` to
redo commits, no worktrees. If a file contains two features, it goes in one commit. The cost of
that is a reviewer reading a slightly wider diff. The cost of the alternative is half an hour and
a real risk of losing work.

## Don't re-run the quality gates

`check-types`, `lint`, `knip` and the E2E suite all ran **before** the work was declared done.
Committing changes no file contents. Nothing needs re-verifying.

Re-running the full E2E suite at commit time is the single worst offender — it's minutes long,
needs Docker, and tells you nothing you didn't know ten minutes ago. Don't.

The only thing worth checking after committing is `git status` — the tree should be clean.

## Messages: short and to the point

A commit message says *what this code is for*. The code says how it works, and the comments say
why. Subject line, blank line, two or three sentences at most. Often the subject alone is enough.

```text
feat(web): import a shopping list from the meal plan

Preview a date range, untick what's already in the cupboard, add the rest.
```

Not this:

```text
feat(web): import a shopping list from the meal plan

The import screen, reachable from the lists toolbar ("From meal plan", minting
a new list) and later from an open list's menu. The range lives in search
params so a view of it is shareable and survives a refresh, and drives the
route's loader; the picking is a real react-hook-form form whose model is
derived from the endpoint's own line model, so what it sends is validated by
the schema that will receive it. [...eleven more lines...]
```

No implementation details, no rationale essays, no listing every file touched. If something
genuinely needs explaining to a reviewer, it belongs in the PR body — once — not in five commit
messages.

## The whole flow

1. `git status` / `git diff --stat` to see the shape.
2. `git add <app>` and commit, once per app.
3. `git status` — clean.
4. Push and open the PR if asked.

Standing constraints: never create branches, and only commit when the user has asked for it in
this conversation.

That last one is the whole boundary, and it is why this skill and `new-feature-module` don't
contradict each other. `new-feature-module` describes finishing a feature, where the answer is
always "stop at the checkpoint and ask" — it never authorises a commit. This skill describes what
to do *after* the user has answered. Reaching for it without that ask is the mistake it exists to
prevent.
