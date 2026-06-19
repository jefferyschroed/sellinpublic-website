# Subagent Work Order

Packet: `2026-06-19-employee-generated-content-examples`

## Rule

No subagent owns the whole post. Each role checks one narrow artifact and stops.

## Required Subagents

- Source Registry Agent: verify first-party example sources and reject generic roundups.
- Research Synthesis Agent: summarize what each example teaches without overstating performance.
- SME Notes Agent: capture Sell In Public POV about what makes an example useful.
- Outline Agent: confirm answer-first structure, example table, checklist, FAQ, and CTA.
- Draft Agent: write only from the approved outline and source set.
- Claim Ledger Agent: map every material claim to source IDs or internal POV.
- AEO/SEO QA Agent: check answer block, headings, metadata, FAQ, source integration, and internal links.

## Stop Conditions

- Stop if any example source cannot support the claim attached to it.
- Stop if the article claims a company won revenue because of content without direct evidence.
- Stop if discovery-only inputs appear in public copy or the claims ledger.
