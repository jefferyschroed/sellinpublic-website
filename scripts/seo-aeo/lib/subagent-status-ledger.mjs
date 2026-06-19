function countByStatus(entries) {
  return entries.reduce((counts, entry) => {
    const status = entry.status || "queued";
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
}

function publicLedgerEntry(taskId, entry) {
  return {
    task_id: taskId,
    status: entry.status || "queued",
    thread_id: entry.thread_id || "",
    completed_at: entry.completed_at || "",
    blocked_at: entry.blocked_at || "",
    claimed_at: entry.claimed_at || "",
    blocker: entry.blocker || "",
    output_artifacts: Array.isArray(entry.output_artifacts) ? entry.output_artifacts : [],
    stale_completion: entry.stale_completion || null,
  };
}

export function summarizeSubagentStatusLedger(queue, status) {
  const queueTasks = Array.isArray(queue?.tasks) ? queue.tasks : [];
  const ledgerTasks = status?.tasks && typeof status.tasks === "object" ? status.tasks : {};
  const queueIds = new Set(queueTasks.map((task) => task.task_id).filter(Boolean));
  const ledgerEntries = Object.entries(ledgerTasks);
  const currentQueueEntries = ledgerEntries.filter(([taskId]) => queueIds.has(taskId));
  const outOfCurrentQueueEntries = ledgerEntries.filter(([taskId]) => !queueIds.has(taskId));
  const implicitQueuedCurrentTasks = queueTasks
    .filter((task) => task.task_id && !ledgerTasks[task.task_id])
    .map((task) => ({
      task_id: task.task_id,
      status: "queued",
      role: task.role || "",
      phase: task.phase || "",
      candidate_id: task.candidate_id || "",
      artifact_path: task.artifact_path || task.write_scope || "",
    }));

  return {
    queue_task_count: queueTasks.length,
    ledger_entry_count: ledgerEntries.length,
    current_queue_entry_count: currentQueueEntries.length,
    implicit_queued_current_task_count: implicitQueuedCurrentTasks.length,
    out_of_current_queue_entry_count: outOfCurrentQueueEntries.length,
    current_queue_by_status: countByStatus([
      ...currentQueueEntries.map(([, entry]) => entry),
      ...implicitQueuedCurrentTasks,
    ]),
    current_queue_ledger_by_status: countByStatus(currentQueueEntries.map(([, entry]) => entry)),
    out_of_current_queue_by_status: countByStatus(outOfCurrentQueueEntries.map(([, entry]) => entry)),
    implicit_queued_current_tasks: implicitQueuedCurrentTasks,
    out_of_current_queue_tasks: outOfCurrentQueueEntries
      .map(([taskId, entry]) => publicLedgerEntry(taskId, entry))
      .sort((a, b) => a.task_id.localeCompare(b.task_id)),
  };
}

export function markdownSubagentStatusLedger(audit) {
  const outOfQueueSample = audit.out_of_current_queue_tasks?.length
    ? audit.out_of_current_queue_tasks
        .slice(0, 20)
        .map((task) => `- \`${task.task_id}\`: ${task.status}`)
        .join("\n")
    : "- None.";
  const implicitQueuedSample = audit.implicit_queued_current_tasks?.length
    ? audit.implicit_queued_current_tasks
        .slice(0, 20)
        .map((task) => `- \`${task.task_id}\`: implicit queued`)
        .join("\n")
    : "- None.";

  return `## Status Ledger Audit

- Queue tasks: ${audit.queue_task_count}
- Ledger entries: ${audit.ledger_entry_count}
- Current-queue ledger entries: ${audit.current_queue_entry_count}
- Implicit queued current tasks: ${audit.implicit_queued_current_task_count}
- Preserved out-of-current-queue history entries: ${audit.out_of_current_queue_entry_count}
- Current queue by status: ${JSON.stringify(audit.current_queue_by_status)}
- Preserved history by status: ${JSON.stringify(audit.out_of_current_queue_by_status)}

### Implicit Queued Current Tasks

${implicitQueuedSample}

### Preserved Out-Of-Current-Queue History Sample

${outOfQueueSample}
`;
}
