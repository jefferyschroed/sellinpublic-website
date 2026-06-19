#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function cleanup(root, runDate) {
  fs.rmSync(path.join(root, "research", "daily-content-plan", runDate), { recursive: true, force: true });
  fs.rmSync(path.join(root, "automation-runs", runDate), { recursive: true, force: true });
}

function runNode(root, args) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  assert(result.status === 0, `${args.join(" ")} failed with ${result.status}: ${output}`);
  return output;
}

function writeQueue(root, runDate) {
  const runDir = path.join(root, "automation-runs", runDate);
  const planDir = path.join(root, "research", "daily-content-plan", runDate);
  ensureDir(runDir);
  ensureDir(planDir);
  const tasks = [
    {
      task_id: "fixture-04_research_synthesis-research-synthesis-agent",
      run_date: runDate,
      candidate_id: "fixture",
      topic: "fixture topic",
      lifecycle_path: "section_or_faq_lifecycle",
      phase: "04_research_synthesis",
      role: "Research Synthesis Agent",
      depends_on: [],
      write_scope: `research/daily-content-plan/${runDate}/research-synthesis-fixture.md`,
      artifact_path: `research/daily-content-plan/${runDate}/research-synthesis-fixture.md`,
      prompt: "Research Synthesis fixture prompt.",
    },
    {
      task_id: "fixture-05_outline-outline-agent",
      run_date: runDate,
      candidate_id: "fixture",
      topic: "fixture topic",
      lifecycle_path: "section_or_faq_lifecycle",
      phase: "05_outline",
      role: "Outline Agent",
      depends_on: ["fixture-04_research_synthesis-research-synthesis-agent"],
      write_scope: `research/daily-content-plan/${runDate}/section-outline-proposal-fixture.md`,
      artifact_path: `research/daily-content-plan/${runDate}/section-outline-proposal-fixture.md`,
      prompt: "Section Outline fixture prompt.",
    },
    {
      task_id: "fixture-07_outline-outline-agent",
      run_date: runDate,
      candidate_id: "fixture",
      topic: "fixture topic",
      lifecycle_path: "refresh_lifecycle",
      phase: "07_outline",
      role: "Outline Agent",
      depends_on: [],
      write_scope: `research/daily-content-plan/${runDate}/outline-proposal-fixture.md`,
      artifact_path: `research/daily-content-plan/${runDate}/outline-proposal-fixture.md`,
      prompt: "Outline fixture prompt.",
    },
    {
      task_id: "fixture-08_draft-draft-agent",
      run_date: runDate,
      candidate_id: "fixture",
      topic: "fixture topic",
      lifecycle_path: "refresh_lifecycle",
      phase: "08_draft",
      role: "Draft Agent",
      depends_on: ["fixture-07_outline-outline-agent"],
      write_scope: `research/daily-content-plan/${runDate}/refresh-draft-notes-fixture.md`,
      artifact_path: `research/daily-content-plan/${runDate}/refresh-draft-notes-fixture.md`,
      prompt: "Draft fixture prompt.",
    },
    {
      task_id: "fixture-12_packet_qa-aeo-seo-qa-agent",
      run_date: runDate,
      candidate_id: "fixture",
      topic: "fixture topic",
      lifecycle_path: "refresh_lifecycle",
      phase: "12_packet_qa",
      role: "AEO/SEO QA Agent",
      depends_on: [],
      write_scope: `research/daily-content-plan/${runDate}/qa-notes-packet_qa-fixture.md`,
      artifact_path: `research/daily-content-plan/${runDate}/qa-notes-packet_qa-fixture.md`,
      prompt: "Packet QA fixture prompt.",
    },
    {
      task_id: "fixture-13_blog_generator-blog-generator-agent",
      run_date: runDate,
      candidate_id: "fixture",
      topic: "fixture topic",
      lifecycle_path: "refresh_lifecycle",
      phase: "13_blog_generator",
      role: "Blog Generator Agent",
      depends_on: ["fixture-12_packet_qa-aeo-seo-qa-agent"],
      write_scope: `research/daily-content-plan/${runDate}/generator-readiness-fixture.md`,
      artifact_path: `research/daily-content-plan/${runDate}/generator-readiness-fixture.md`,
      prompt: "Blog Generator fixture prompt.",
    },
    {
      task_id: "fixture-14_index_feed-index-feed-agent",
      run_date: runDate,
      candidate_id: "fixture",
      topic: "fixture topic",
      lifecycle_path: "refresh_lifecycle",
      phase: "14_index_feed",
      role: "Index/Feed Agent",
      depends_on: ["fixture-13_blog_generator-blog-generator-agent"],
      write_scope: `research/daily-content-plan/${runDate}/index-feed-check-fixture.md`,
      artifact_path: `research/daily-content-plan/${runDate}/index-feed-check-fixture.md`,
      prompt: "Index/Feed fixture prompt.",
    },
  ];
  fs.writeFileSync(
    path.join(runDir, "subagent-queue.json"),
    `${JSON.stringify({ run_date: runDate, generated_at: new Date().toISOString(), tasks }, null, 2)}\n`
  );
}

function writeQa(root, runDate, decision, extra = "") {
  fs.writeFileSync(
    path.join(root, "research", "daily-content-plan", runDate, "qa-notes-packet_qa-fixture.md"),
    `# QA Report: fixture

Decision: \`${decision}\`
ready_for_generator: ${decision === "rejected" ? "false" : "true"}

${extra}
`
  );
}

function writeOutlineStop(root, runDate) {
  fs.writeFileSync(
    path.join(root, "research", "daily-content-plan", runDate, "outline-proposal-fixture.md"),
    "# Outline Proposal\n\nStatus: `outline_stopped_missing_approval_gates`\n\nNo Draft handoff is authorized.\n"
  );
}

function writeResearchStop(root, runDate) {
  fs.writeFileSync(
    path.join(root, "research", "daily-content-plan", runDate, "research-synthesis-fixture.md"),
    "# Research Synthesis\n\nStatus: `research_synthesis_blocked_before_packet`\n\nNo outline is authorized.\n"
  );
}

function writeResearchReady(root, runDate) {
  fs.writeFileSync(
    path.join(root, "research", "daily-content-plan", runDate, "research-synthesis-fixture.md"),
    "# Research Synthesis\n\nDecision: `approved`\n\nOutline handoff authorized.\n"
  );
}

function dispatch(root, runDate) {
  runNode(root, ["scripts/seo-aeo/subagent-queue.mjs", "sync-completions", "--date", runDate]);
  runNode(root, ["scripts/seo-aeo/build-subagent-dispatch.mjs", "--date", runDate, "--max", "3"]);
  return JSON.parse(
    fs.readFileSync(path.join(root, "automation-runs", runDate, "subagent-dispatch", "ready-batch.json"), "utf8")
  );
}

function readyList(root, runDate) {
  return JSON.parse(runNode(root, ["scripts/seo-aeo/subagent-queue.mjs", "list-ready", "--date", runDate, "--max", "3"]));
}

function run() {
  const root = process.cwd();
  const runDate = "2099-01-13";
  cleanup(root, runDate);
  try {
    writeQueue(root, runDate);
    writeResearchStop(root, runDate);
    writeOutlineStop(root, runDate);
    writeQa(root, runDate, "rejected", "## Blockers\n\n- Critical fixture blocker.\n");

    const rejectedDispatch = dispatch(root, runDate);
    const rejectedReady = readyList(root, runDate);
    assert(rejectedDispatch.selected_tasks.length === 0, "rejected QA must not select Blog Generator.");
    assert(rejectedReady.ready === 0, "queue list-ready must agree that rejected QA blocks Blog Generator.");
    const sectionOutlineBlocker = rejectedDispatch.blocked_tasks.find((task) => task.phase === "05_outline");
    assert(sectionOutlineBlocker, "Section Outline should be listed as blocked after a research stop note.");
    assert(
      sectionOutlineBlocker.dependency_blockers?.some((blocker) => blocker.reason === "dependency_stop_or_rejection_artifact"),
      "Section Outline should carry dependency_stop_or_rejection_artifact blocker."
    );
    const draftBlocker = rejectedDispatch.blocked_tasks.find((task) => task.phase === "08_draft");
    assert(draftBlocker, "Draft should be listed as blocked after an outline stop note.");
    assert(
      draftBlocker.dependency_blockers?.some((blocker) => blocker.reason === "dependency_stop_or_rejection_artifact"),
      "Draft should carry dependency_stop_or_rejection_artifact blocker."
    );
    const generatorBlocker = rejectedDispatch.blocked_tasks.find((task) => task.phase === "13_blog_generator");
    assert(generatorBlocker, "Blog Generator should be listed as blocked.");
    assert(
      generatorBlocker.dependency_blockers?.some((blocker) => blocker.reason === "qa_not_approved_for_generator"),
      "Blog Generator should carry qa_not_approved_for_generator blocker."
    );

    cleanup(root, runDate);
    writeQueue(root, runDate);
    writeResearchReady(root, runDate);
    fs.writeFileSync(
      path.join(root, "research", "daily-content-plan", runDate, "outline-proposal-fixture.md"),
      "# Outline Proposal\n\nDecision: `approved`\n\nDraft handoff authorized.\n"
    );
    writeQa(root, runDate, "approved_with_notes");

    const approvedDispatch = dispatch(root, runDate);
    const approvedReady = readyList(root, runDate);
    assert(approvedDispatch.selected_tasks.length === 3, "approved research, outline, and QA should select Section Outline, Draft, and Blog Generator.");
    assert(
      approvedDispatch.selected_tasks.some((task) => task.phase === "05_outline") &&
      approvedDispatch.selected_tasks.some((task) => task.phase === "08_draft") &&
        approvedDispatch.selected_tasks.some((task) => task.phase === "13_blog_generator"),
      "selected tasks should include Section Outline, Draft, and Blog Generator."
    );
    assert(
      approvedReady.ready === 3 &&
        approvedReady.tasks.some((task) => task.phase === "05_outline") &&
        approvedReady.tasks.some((task) => task.phase === "08_draft") &&
        approvedReady.tasks.some((task) => task.phase === "13_blog_generator"),
      "list-ready should include Section Outline, Draft, and Blog Generator."
    );

    fs.writeFileSync(
      path.join(root, "research", "daily-content-plan", runDate, "generator-readiness-fixture.md"),
      "# Generator Readiness\n\nStatus: `generation_stopped_missing_packet`\n\nNo generated output authorized.\n"
    );
    const stoppedGeneratorDispatch = dispatch(root, runDate);
    const indexBlocker = stoppedGeneratorDispatch.blocked_tasks.find((task) => task.phase === "14_index_feed");
    assert(indexBlocker, "Index/Feed should be listed as blocked after a generator stop note.");
    assert(
      indexBlocker.dependency_blockers?.some((blocker) => blocker.reason === "dependency_stop_or_rejection_artifact"),
      "Index/Feed should carry dependency_stop_or_rejection_artifact blocker."
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          fixture: "subagent_dispatch_readiness",
          rejected_qa_selected_tasks: rejectedDispatch.selected_tasks.length,
          approved_selected_tasks: approvedDispatch.selected_tasks.map((task) => task.task_id),
          stopped_research_outline_status: sectionOutlineBlocker.dispatch_status,
          stopped_generator_index_feed_status: indexBlocker.dispatch_status,
        },
        null,
        2
      )
    );
  } finally {
    cleanup(root, runDate);
  }
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
