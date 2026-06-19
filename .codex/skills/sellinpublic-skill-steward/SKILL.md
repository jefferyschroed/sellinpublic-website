---
name: sellinpublic-skill-steward
description: Maintain Sell In Public repo-local Codex skills. Use when creating, editing, reviewing, or validating skills under `.codex/skills` in the sellinpublic-website repo, especially when the task mentions skill stewardship, skill-creator rules, `SKILL.md`, `agents/openai.yaml`, local skill metadata, validation, or limiting edits to owned skill folders.
---

# Sell In Public Skill Steward

Use this skill to keep repo-local Sell In Public skills concise, discoverable, and safe to edit in a shared worktree.

## Workflow

1. Read `/Users/jeff/.codex/skills/.system/skill-creator/SKILL.md` before creating or substantially updating a skill.
2. Confirm the requested ownership scope. Edit only the requested files; never use skill work as a reason to touch docs, scripts, content packets, blog pages, analytics, or site files outside the user's explicit scope.
3. Inspect the target skill before editing:
   - `SKILL.md`
   - `agents/openai.yaml`
   - any directly linked one-level references or assets that are relevant to the requested change
4. For new skills, initialize with the skill-creator `init_skill.py` helper when possible, then replace all template TODO content.
5. Keep frontmatter to exactly `name` and `description`. Put all trigger guidance in `description`, not in a body "when to use" section.
6. Keep `SKILL.md` compact and procedural. Link to existing repo docs instead of copying them unless the detail is core and short.
7. Add bundled `references/`, `scripts/`, or `assets/` only when the skill needs them. Keep references one level deep from `SKILL.md`.
8. Keep `agents/openai.yaml` aligned with the skill:
   - `interface.display_name`
   - `interface.short_description`
   - `interface.default_prompt` mentioning `$skill-name`
   - no optional icons, colors, dependencies, or policies unless explicitly requested
9. Preserve unrelated work in the repo. Do not revert files you did not change.

## Learning Candidate Schema

When QA, analytics, or publishing work exposes a reusable process issue, capture a learning candidate before editing a skill:

- `candidate_id`
- `date`
- `source_type`
- `source_path`
- `observed_problem`
- `affected_workflow`
- `target_skill`
- `root_cause`
- `evidence`
- `reusability_classification`
- `proposed_change`
- `risk`
- `reviewer`

Use `reusability_classification: reusable_process_change` only when the candidate has at least two evidence items or `repeat_count >= 2`. Reject one-off preferences, transient keyword tactics, isolated layout bugs, and analytics thresholds that should stay in the repo SOPs.

## Skill Update Gates

Do not promote a skill change unless all gates pass:

1. Evidence is captured in the learning candidate.
2. Steward classifies the issue as reusable instead of one-off.
3. The learning candidate passes the repo checker:

   ```sh
   node scripts/seo-aeo/check-skill-learning.mjs --file <candidate-file>
   ```

4. Minimal skill patch is proposed.
5. Skill validation passes.
6. Relevant repo checks pass.
7. A forward-test subagent runs on raw artifacts and reports whether the updated skill would have prevented the issue.
8. Human approval is given before promoting anything to `~/.codex/skills`.

Performance learnings can update process guidance, but must not hard-code transient keyword tactics or analytics thresholds into writing skills.

## Validation

Run the repo-local dependency-free validator on every changed skill folder:

```sh
python3 .codex/skills/sellinpublic-skill-steward/scripts/validate_skill.py .codex/skills/<skill-name>
```

If the local environment has PyYAML installed, also run the system skill-creator validator for parity:

```sh
python3 /Users/jeff/.codex/skills/.system/skill-creator/scripts/quick_validate.py .codex/skills/<skill-name>
```

If the validator fails, fix the reported issue and run it again.
