/**
 * Just enough vCard (RFC 6350, and 3.0 as Nextcloud and Apple write it) to
 * read a contact's birthday: the name, the day and a stable id (§12, D46).
 */
export interface VCardBirthday { uid: string; name: string; date: string }

const unescape = (v: string) => v.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();

/** One logical line per property, with the property name (no group), its parameters and value. */
function properties(card: string) {
  const lines = card.replace(/\r\n|\r/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  return lines.flatMap((line) => {
    const colon = line.indexOf(":");
    if (colon < 0) return [];
    const [head, ...params] = line.slice(0, colon).split(";");
    return [{ name: head.replace(/^[^.]*\./, "").toUpperCase(), params: params.map((p) => p.toUpperCase()), value: line.slice(colon + 1) }];
  });
}

/**
 * The birthday as YYYY-MM-DD, or --MM-DD without a year. Apple marks an
 * unknown year with X-APPLE-OMIT-YEAR (year 1604); some apps write 0000.
 */
export function birthdayValue(value: string, params: string[] = []): string | null {
  const v = value.trim();
  const m = /^(\d{4}|--)-?(\d{2})-?(\d{2})(?:T.*)?$/.exec(v);
  if (!m) return null;
  const month = Number(m[2]), day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const omit = params.find((p) => p.startsWith("X-APPLE-OMIT-YEAR="));
  const year = m[1] === "--" || m[1] === "0000" || (omit && omit.split("=")[1] === m[1]) ? null : m[1];
  return `${year ?? "-"}-${m[2]}-${m[3]}`;
}

/** Every contact with a birthday in a vCard file (usually one per file). */
export function parseVCardBirthdays(text: string, fallbackUid: string): VCardBirthday[] {
  const out: VCardBirthday[] = [];
  const cards = text.split(/^BEGIN:VCARD\s*$/im).slice(1);
  cards.forEach((card, i) => {
    const props = properties(card.split(/^END:VCARD\s*$/im)[0]);
    const get = (n: string) => props.find((p) => p.name === n);
    const bday = get("BDAY");
    const date = bday && birthdayValue(bday.value, bday.params);
    if (!date) return;
    let name = unescape(get("FN")?.value ?? "");
    if (!name) {
      const [family = "", given = ""] = (get("N")?.value ?? "").split(";").map(unescape);
      name = [given, family].filter(Boolean).join(" ");
    }
    if (!name) return;
    const uid = unescape(get("UID")?.value ?? "") || (cards.length > 1 ? `${fallbackUid}#${i}` : fallbackUid);
    out.push({ uid, name, date });
  });
  return out;
}
