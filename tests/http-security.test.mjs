import assert from "node:assert/strict";
import test from "node:test";
import { sameOriginMutation } from "../api/_lib/request-security.ts";
import { loginRateLimitKey } from "../api/_lib/login-rate-limit-key.ts";

test("aceita mutação com origem igual à API", () => {
  const request = new Request("https://portal.exemplo/api/occurrences", { method: "POST", headers: { origin: "https://portal.exemplo" } });
  assert.equal(sameOriginMutation(request), true);
});

test("rejeita mutação sem Origin ou vinda de outra origem", () => {
  assert.equal(sameOriginMutation(new Request("https://portal.exemplo/api/occurrences")), false);
  assert.equal(sameOriginMutation(new Request("https://portal.exemplo/api/occurrences", { headers: { origin: "https://malicioso.exemplo" } })), false);
});

test("gera uma chave estável sem armazenar o IP em texto aberto", async () => {
  const first = new Request("https://portal.exemplo/api/auth/login", { headers: { "x-forwarded-for": "192.0.2.10, 198.51.100.2" } });
  const second = new Request("https://portal.exemplo/api/auth/login", { headers: { "x-forwarded-for": "192.0.2.10" } });
  const key = await loginRateLimitKey(first);
  assert.equal(key, await loginRateLimitKey(second));
  assert.equal(key.length, 64);
  assert.doesNotMatch(key, /192\.0\.2\.10/);
});
