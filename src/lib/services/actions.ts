/**
 * The data seam to the server (§17): Server Actions, re-exported so that UI
 * code reaches the server only through `src/lib/services` and `src/lib/state`.
 */
export * from "@/server/actions/household";
export { setup } from "@/server/actions/setup";
