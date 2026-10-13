import { z } from "zod";
import type * as Real from "@/server/actions/birthdays";
import { DemoError, act, notInDemo } from "../demo/browser";

/** Contact birthdays in the static demo (§20 D74): shown, renamed and linked here; address books need a server. */
export const listAddressBooks: typeof Real.listAddressBooks = notInDemo;
export const setContactBooks: typeof Real.setContactBooks = notInDemo;
export const setContactPhoto: typeof Real.setContactPhoto = notInDemo;

const contactBirthday = z.object({
  id: z.string().min(1),
  show: z.boolean().optional(),
  alias: z.string().trim().max(80).optional(),
  memberId: z.string().min(1).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
});

export const updateContactBirthday: typeof Real.updateContactBirthday = act(contactBirthday, (s, input) => {
  const c = s.birthdays.find((b) => b.id === input.id);
  if (!c) throw new DemoError("notFound");
  if (input.show !== undefined) c.show = input.show;
  if (input.alias !== undefined) c.alias = input.alias || undefined;
  if (input.memberId !== undefined) c.memberId = input.memberId ?? undefined;
  if (input.color !== undefined) c.color = input.color ?? undefined;
});
