import type * as Real from "@/server/actions/setup";
import { notInDemo } from "../demo/browser";

/** The static demo starts with the Müller family; first-run setup needs a server (§20 D74). */
export const setup: typeof Real.setup = notInDemo;
