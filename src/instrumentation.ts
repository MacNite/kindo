/**
 * Runs once when the server starts. Background jobs live in the Node.js
 * runtime only, never in the edge runtime or during `next build`.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { registerAllJobs } = await import("./server/register-jobs");
  const { startJobs } = await import("./server/jobs");
  registerAllJobs();
  startJobs();
}
