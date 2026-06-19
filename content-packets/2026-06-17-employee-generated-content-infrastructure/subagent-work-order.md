# Subagent Work Order

Packet: `2026-06-17-employee-generated-content-infrastructure`

Candidate: what is employee-generated content

Packet intake status: intake_ready

## Intake Snapshot

- Packet intake: `packet-intake.yaml`
- Discovery exclusions: `discovery-exclusions.json`
- Strategic asset decision: post
- Scaffold asset decision: post
- Current gate status: `intake_ready`

## Evidence Boundary

Discovery inputs are visible for topic language, H2/FAQ direction, and source-gap routing only.

No subagent may add excluded discovery sources to:

- `citations.json`
- `claims-ledger.csv` `source_ids`
- draft citation markers
- `article.blocks.json` source references

If discovery suggests a factual claim, Source Registry must find an approved source or record a source gap.

## Agent-Specific Instructions

1. Query Intelligence: use excluded inputs only for query/intent/heading guidance.
2. Source Registry: replace discovery leads with approved factual sources.
3. Research Synthesis: summarize discovery as non-citable context only.
4. Claim Ledger: reject excluded source IDs as support.
5. QA: compare `citations.json`, `claims-ledger.csv`, `draft.md`, and `article.blocks.json` against `discovery-exclusions.json`.

## Rule

No single subagent owns this whole post. Each subagent writes its artifact only. The integrator merges approved outputs after QA.
