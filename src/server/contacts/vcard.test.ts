import { describe, expect, it } from "vitest";
import { birthdayValue, parseVCardBirthdays } from "./vcard";

const card = (lines: string[]) => ["BEGIN:VCARD", "VERSION:3.0", ...lines, "END:VCARD", ""].join("\r\n");

describe("birthdayValue", () => {
  it("reads the forms address books write", () => {
    expect(birthdayValue("1951-10-13")).toBe("1951-10-13");
    expect(birthdayValue("19511013")).toBe("1951-10-13");
    expect(birthdayValue("1951-10-13T00:00:00Z")).toBe("1951-10-13");
    expect(birthdayValue("--1013")).toBe("--10-13");
    expect(birthdayValue("--10-13")).toBe("--10-13");
  });

  it("drops a year that only stands for 'unknown'", () => {
    expect(birthdayValue("1604-07-04", ["VALUE=DATE", "X-APPLE-OMIT-YEAR=1604"])).toBe("--07-04");
    expect(birthdayValue("0000-07-04")).toBe("--07-04");
  });

  it("ignores free text and impossible days", () => {
    expect(birthdayValue("circa 1950")).toBeNull();
    expect(birthdayValue("1951-13-01")).toBeNull();
  });
});

describe("parseVCardBirthdays", () => {
  it("takes the name, birthday and UID, with folded lines and escapes", () => {
    const text = card(["UID:abc-1", "FN:Mama Nitsch", " ke", "N:Nitschke;Brigitte;;;", "item1.BDAY;VALUE=date:19511013"]);
    expect(parseVCardBirthdays(text, "/a.vcf")).toEqual([{ uid: "abc-1", name: "Mama Nitschke", date: "1951-10-13" }]);
    expect(parseVCardBirthdays(card(["FN:Müller\\, Peter", "BDAY:--0704"]), "/b.vcf")).toEqual([{ uid: "/b.vcf", name: "Müller, Peter", date: "--07-04" }]);
  });

  it("builds the name from N when FN is empty, and skips contacts without a birthday", () => {
    expect(parseVCardBirthdays(card(["UID:x", "FN:", "N:Weber;Ingrid;;;", "BDAY:1956-01-09"]), "/c.vcf")).toEqual([{ uid: "x", name: "Ingrid Weber", date: "1956-01-09" }]);
    expect(parseVCardBirthdays(card(["UID:y", "FN:No Birthday"]), "/d.vcf")).toEqual([]);
  });

  it("reads several contacts in one file", () => {
    const text = card(["FN:A", "BDAY:2000-01-01"]) + card(["FN:B", "BDAY:2001-02-02"]);
    expect(parseVCardBirthdays(text, "/e.vcf").map((c) => c.uid)).toEqual(["/e.vcf#0", "/e.vcf#1"]);
  });
});
