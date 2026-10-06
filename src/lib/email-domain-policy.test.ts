import { describe, expect, test } from "vitest";
import {
  checkSignupEmail,
  isAliasLikeLocalPart,
  isRandomLookingLocalPart,
} from "./email-domain-policy";

describe("signup local parts", () => {
  test.each(["taro1990", "yamada2001", "muxjcx87394v", "TARO1990"])(
    "%s uses verification rather than alias rejection",
    (local) => {
      expect(isAliasLikeLocalPart(local)).toBe(false);
      expect(isRandomLookingLocalPart(local)).toBe(true);
      expect(checkSignupEmail(`${local}@outlook.com`)).toEqual({ ok: true });
      expect(checkSignupEmail(`${local}@u-tokyo.ac.jp`)).toEqual({ ok: true });
    },
  );
  test.each(["user+tag", "e.l.adu.v.a.r.61.5", "a.b.c.d", "a..b", ".name", "name."])(
    "%s remains an alias rejection",
    (local) => {
      expect(isAliasLikeLocalPart(local)).toBe(true);
      expect(checkSignupEmail(`${local}@icloud.com`)).toEqual({
        ok: false,
        reason: "alias_not_allowed",
      });
    },
  );
  test.each(["john.doe", "j.doe", "jane_smith", "taro_1990", "taro.1990"])(
    "%s remains an ordinary mailbox",
    (local) => {
      expect(isAliasLikeLocalPart(local)).toBe(false);
      expect(isRandomLookingLocalPart(local)).toBe(false);
    },
  );
  test("provider policy still applies to advisory local parts", () => {
    expect(checkSignupEmail("taro1990@gmail.com")).toEqual({
      ok: false,
      reason: "use_google_oauth",
    });
    expect(checkSignupEmail("taro1990@example.com")).toEqual({ ok: false, reason: "not_allowed" });
  });
});
