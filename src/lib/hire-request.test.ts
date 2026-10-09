import { describe, expect, it } from "vitest";
import {
  hireBody,
  hireStatus,
  hireSubject,
  parseHireRequest,
  type HireRequest,
} from "./hire-request";

const MOTIVATION = "I would like to talk about a product engineering role.";

function form(fields: Record<string, string | Blob>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

const VALID = {
  offer: "AI consulting",
  email: "ada@example.com",
  name: "Ada Lovelace",
  motivation: MOTIVATION,
};

describe("parseHireRequest", () => {
  it("parses a valid form, trimming the name and the motivation", () => {
    expect(
      parseHireRequest(
        form({
          ...VALID,
          email: " ada@example.com ",
          name: "  Ada  ",
          motivation: `\n${MOTIVATION}  `,
        }),
      ),
    ).toEqual({
      offer: "AI consulting",
      email: "ada@example.com",
      name: "Ada",
      motivation: MOTIVATION,
    });
  });

  it("accepts a missing or blank name as empty", () => {
    const { name: _name, ...noName } = VALID;
    expect(parseHireRequest(form(noName))?.name).toBe("");
    expect(parseHireRequest(form({ ...VALID, name: "   " }))?.name).toBe("");
  });

  it("keeps newlines in the motivation, normalised to \\n", () => {
    const motivation = "First line of the message.\r\nSecond line of the message.";
    expect(parseHireRequest(form({ ...VALID, motivation }))?.motivation).toBe(
      "First line of the message.\nSecond line of the message.",
    );
  });

  it.each([
    ["missing", undefined],
    ["unknown", "Designer"],
    ["differently cased", "ai consulting"],
    ["padded", " AI consulting"],
  ])("rejects an offer that is %s", (_label, offer) => {
    const { offer: _offer, ...rest } = VALID;
    expect(parseHireRequest(form(offer === undefined ? rest : { ...rest, offer }))).toBeNull();
  });

  it.each([
    ["missing", undefined],
    ["without an @", "ada.example.com"],
    ["with a space", "ada lovelace@example.com"],
    ["without a TLD", "ada@example"],
    ["over 254 characters", `${"a".repeat(245)}@example.com`],
  ])("rejects an email that is %s", (_label, email) => {
    const { email: _email, ...rest } = VALID;
    expect(parseHireRequest(form(email === undefined ? rest : { ...rest, email }))).toBeNull();
  });

  it.each([
    ["missing", undefined],
    ["19 characters after trimming", `  ${"x".repeat(19)}  `],
    ["4001 characters", "x".repeat(4001)],
    ["whitespace only", " \n ".repeat(10)],
  ])("rejects a motivation that is %s", (_label, motivation) => {
    const { motivation: _motivation, ...rest } = VALID;
    expect(
      parseHireRequest(form(motivation === undefined ? rest : { ...rest, motivation })),
    ).toBeNull();
  });

  it("accepts a motivation of exactly 20 and exactly 4000 characters", () => {
    expect(parseHireRequest(form({ ...VALID, motivation: "x".repeat(20) }))).not.toBeNull();
    expect(parseHireRequest(form({ ...VALID, motivation: "x".repeat(4000) }))).not.toBeNull();
  });

  it("caps a 150 character name at 100", () => {
    expect(parseHireRequest(form({ ...VALID, name: "n".repeat(150) }))?.name).toBe("n".repeat(100));
  });

  it.each(["offer", "email", "name", "motivation"])("rejects %s sent as a file", (field) => {
    expect(parseHireRequest(form({ ...VALID, [field]: new Blob(["x"]) }))).toBeNull();
  });

  describe("header injection", () => {
    it("flattens a name with CR/LF to one line", () => {
      const parsed = parseHireRequest(form({ ...VALID, name: "Eve\r\nBcc: x@y.z" }));
      expect(parsed?.name).toBe("Eve Bcc: x@y.z");
      expect(parsed?.name).not.toMatch(/[\r\n]/);
    });

    it.each(["a@b.c\r\nBcc: x@y.z", "a@b.c\nX: y", "a@b.c\rX: y", "a@b.c\u0000"])(
      "rejects the email %j",
      (email) => {
        expect(parseHireRequest(form({ ...VALID, email }))).toBeNull();
      },
    );

    it("never puts a line break in the subject", () => {
      const parsed = parseHireRequest(form({ ...VALID, name: "Eve\nBcc: x@y.z\r\n" }));
      expect(parsed).not.toBeNull();
      expect(hireSubject(parsed as HireRequest)).not.toMatch(/[\r\n]/);
    });
  });
});

const REQUEST: HireRequest = {
  offer: "Product engineer",
  email: "ada@example.com",
  name: "Ada",
  motivation: MOTIVATION,
};

describe("hireSubject", () => {
  it("uses the name when it is given", () => {
    expect(hireSubject(REQUEST)).toBe("Hire: Product engineer - Ada");
  });

  it("uses the email when there is no name", () => {
    expect(hireSubject({ ...REQUEST, name: "" })).toBe("Hire: Product engineer - ada@example.com");
  });
});

describe("hireBody", () => {
  it("contains the offer, name, email and motivation", () => {
    const body = hireBody(REQUEST);
    expect(body).toContain("Offer: Product engineer");
    expect(body).toContain("Name: Ada");
    expect(body).toContain("Email: ada@example.com");
    expect(body).toContain(`\n\n${MOTIVATION}`);
  });

  it("marks a missing name", () => {
    expect(hireBody({ ...REQUEST, name: "" })).toContain("Name: (not given)");
  });
});

describe("hireStatus", () => {
  it("is sent for sent=1", () => {
    expect(hireStatus({ sent: "1" })).toEqual({ kind: "sent" });
  });

  it.each(["verification", "invalid", "send"] as const)("is an error for %s", (code) => {
    expect(hireStatus({ error: code })).toEqual({ kind: "error", code });
  });

  it.each([
    ["an unknown code", { error: "boom" }],
    ["an inherited key", { error: "toString" }],
    ["sent other than 1", { sent: "yes" }],
    ["a repeated sent", { sent: ["1", "1"] }],
    ["a repeated error", { error: ["send", "send"] }],
    ["no params", {}],
  ])("is null for %s", (_label, params) => {
    expect(hireStatus(params)).toBeNull();
  });
});
