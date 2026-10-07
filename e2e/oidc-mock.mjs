/**
 * A minimal OpenID Connect provider for the end-to-end suite, adapted from
 * BrewCore's. It behaves like an authentik provider: discovery, an
 * authorisation endpoint that signs the person in at once (with PKCE), a
 * token endpoint with an RS256 ID token whose key is published as JWKS (as
 * authentik does), and userinfo. Who signs in is set by
 * the test through `POST /__identity`.
 */
import { createHash, createSign, generateKeyPairSync, randomBytes } from "node:crypto";
import { createServer } from "node:http";

const port = Number(process.env.OIDC_MOCK_PORT ?? 3199);
const issuer = `http://127.0.0.1:${port}`;
const clientId = process.env.OIDC_CLIENT_ID ?? "kindo-e2e";

let identity = { sub: "nobody", email: "nobody@example.test", email_verified: true, name: "Nobody" };
const codes = new Map(); // code -> { nonce, challenge, identity }
const tokens = new Map(); // access token -> identity

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const KID = "e2e-key";
const jwk = { ...publicKey.export({ format: "jwk" }), kid: KID, alg: "RS256", use: "sig" };
const b64 = (v) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");
function jwt(claims) {
  const head = b64({ alg: "RS256", typ: "JWT", kid: KID });
  const body = b64(claims);
  const sig = createSign("RSA-SHA256").update(`${head}.${body}`).sign(privateKey).toString("base64url");
  return `${head}.${body}.${sig}`;
}
const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
};
const readBody = (req) => new Promise((resolve) => {
  let data = "";
  req.on("data", (c) => (data += c));
  req.on("end", () => resolve(data));
});

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", issuer);
  if (url.pathname === "/health") return json(res, 200, { ok: true });
  if (url.pathname === "/.well-known/openid-configuration") {
    return json(res, 200, {
      issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, userinfo_endpoint: `${issuer}/userinfo`,
      jwks_uri: `${issuer}/jwks`, response_types_supported: ["code"], subject_types_supported: ["public"], id_token_signing_alg_values_supported: ["RS256"],
      code_challenge_methods_supported: ["S256"],
    });
  }
  if (url.pathname === "/jwks") return json(res, 200, { keys: [jwk] });
  if (url.pathname === "/__identity" && req.method === "POST") {
    identity = { email_verified: true, ...JSON.parse(await readBody(req)) };
    return json(res, 200, identity);
  }
  if (url.pathname === "/authorize") {
    const redirect = new URL(url.searchParams.get("redirect_uri") ?? "");
    const code = randomBytes(16).toString("hex");
    codes.set(code, { nonce: url.searchParams.get("nonce"), challenge: url.searchParams.get("code_challenge"), identity });
    redirect.searchParams.set("code", code);
    redirect.searchParams.set("state", url.searchParams.get("state") ?? "");
    res.writeHead(302, { location: redirect.toString() });
    return res.end();
  }
  if (url.pathname === "/token" && req.method === "POST") {
    const params = new URLSearchParams(await readBody(req));
    const grant = codes.get(params.get("code") ?? "");
    codes.delete(params.get("code") ?? "");
    const verifier = params.get("code_verifier") ?? "";
    if (!grant || (grant.challenge && createHash("sha256").update(verifier).digest("base64url") !== grant.challenge)) return json(res, 400, { error: "invalid_grant" });
    const access = randomBytes(16).toString("hex");
    tokens.set(access, grant.identity);
    const now = Math.floor(Date.now() / 1000);
    const idToken = jwt({ iss: issuer, aud: clientId, sub: grant.identity.sub, iat: now, exp: now + 300, nonce: grant.nonce ?? undefined, ...grant.identity });
    return json(res, 200, { id_token: idToken, access_token: access, token_type: "Bearer", expires_in: 300 });
  }
  if (url.pathname === "/userinfo") {
    const who = tokens.get((req.headers.authorization ?? "").replace(/^Bearer /, ""));
    return who ? json(res, 200, who) : json(res, 401, { error: "invalid_token" });
  }
  json(res, 404, { error: "not_found" });
}).listen(port, "127.0.0.1");
