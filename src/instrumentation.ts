/**
 * Runs once when the server starts. Background jobs live in the Node.js
 * runtime only; written this way so the edge build drops the import.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
