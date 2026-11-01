import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { afterEach, mock, test } from 'node:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { ChatGPTAuth, buildAuthorizationUrl, createPkce, grantedPlanAccess, validateCallback, type SecretStore } from '../src/auth.js';

const ISSUER = 'https://auth.openai.com';
const ACCOUNT = 'typeTheChange.chatgpt.account.v1';
const HOST = 'typeTheChange.chatgpt.host.v1';
const CLIENT = 'oaiapp_test_registration';
const PLAN_SCOPE = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const realFetch = globalThis.fetch;
const key = await generateKeyPair('RS256');
const publicJwk = { ...await exportJWK(key.publicKey), kid: 'test-key', alg: 'RS256', use: 'sig' };
afterEach(() => mock.restoreAll());

class MemorySecrets implements SecretStore {
  readonly values = new Map<string, string>();
  async get(key: string) { return this.values.get(key); }
  async store(key: string, value: string) { this.values.set(key, value); }
  async delete(key: string) { this.values.delete(key); }
  account(): Record<string, unknown> { return JSON.parse(this.values.get(ACCOUNT)!); }
  expire() { this.values.set(ACCOUNT, JSON.stringify({ ...this.account(), expiresAt: 0 })); }
}

async function idToken(nonce: string, subject = 'subject-1', audience = CLIENT) {
  return new SignJWT({ nonce, email: 'test@example.invalid' }).setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(ISSUER).setAudience(audience).setSubject(subject).setIssuedAt().setExpirationTime('1h').sign(key.privateKey);
}

function fixture(options: {
  scope?: string; nonce?: string; subject?: string; audience?: string;
  refreshError?: boolean; revokeError?: boolean; preventCallback?: boolean;
  authorizationErrorOnce?: boolean;
  invalidSignature?: boolean;
  tokenOverrides?: Record<string,unknown>;
  refreshScopes?: string;
} = {}) {
  const secrets = new MemorySecrets();
  const requests: { url: string; form: URLSearchParams }[] = [];
  const authorizations: URL[] = [];
  let activeNonce = '';
  let notified!: (url: URL) => void;
  const opened = new Promise<URL>(resolve => { notified = resolve; });
  mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    // Only the ephemeral loopback callback may reach a real socket in these tests.
    if (url.startsWith('http://127.0.0.1:')) return realFetch(input, init);
    assert.equal(init?.redirect, 'error');
    assert.ok(init?.signal);
    const form = new URLSearchParams(String(init?.body ?? ''));
    requests.push({ url, form });
    if (url === `${ISSUER}/.well-known/openid-configuration`) return Response.json({
      issuer: ISSUER, authorization_endpoint: `${ISSUER}/api/accounts/authorize`,
      token_endpoint: `${ISSUER}/api/accounts/oauth/token`, revocation_endpoint: `${ISSUER}/api/accounts/oauth/revoke`,
      jwks_uri: `${ISSUER}/.well-known/jwks.json`,
    });
    if (url === `${ISSUER}/.well-known/jwks.json`) return Response.json({ keys: [publicJwk] });
    if (url === `${ISSUER}/api/accounts/oauth/revoke`) return new Response('', { status: options.revokeError ? 503 : 200 });
    if (url === `${ISSUER}/api/accounts/oauth/token`) {
      assert.equal(form.get('client_id'), CLIENT);
      assert.equal(form.get('resource'), 'https://api.openai.com/v1');
      if (form.get('grant_type') === 'refresh_token') {
        assert.equal(form.has('scope'), false);
        await new Promise(resolve => setTimeout(resolve, 10));
        if (options.refreshError) return Response.json({ error: 'invalid_grant', error_description: 'secret-must-not-appear' }, { status: 400 });
        return Response.json({ access_token: 'refreshed-access', refresh_token: 'rotated-refresh', token_type: 'Bearer', expires_in: 3600, ...(options.refreshScopes===undefined?{}:{scope:options.refreshScopes}) });
      }
      const current = authorizations.at(-1)!;
      if (options.authorizationErrorOnce) {
        options.authorizationErrorOnce = false;
        return Response.json({ error: 'invalid_grant' }, { status: 400 });
      }
      assert.equal(form.get('redirect_uri'), current.searchParams.get('redirect_uri'));
      assert.equal(createHash('sha256').update(form.get('code_verifier')!).digest('base64url'), current.searchParams.get('code_challenge'));
      let identity = await idToken(options.nonce ?? activeNonce, options.subject, options.audience);
      if (options.invalidSignature) {
        const parts = identity.split('.');
        parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1);
        identity = parts.join('.');
      }
      return Response.json({
        id_token: identity,
        access_token: 'test-access', refresh_token: 'test-refresh', token_type: 'Bearer', expires_in: 3600,
        scope: options.scope ?? PLAN_SCOPE,
        ...options.tokenOverrides,
      });
    }
    assert.fail(`Unexpected URL in test: ${url}`);
  });
  const auth = new ChatGPTAuth({
    secrets, appName: 'Type the Change',
    openExternal: async raw => {
      const url = new URL(raw);
      authorizations.push(url);
      activeNonce = url.searchParams.get('nonce')!;
      notified(url);
      if (!options.preventCallback) {
        const callback = new URL(url.searchParams.get('redirect_uri')!);
        callback.searchParams.set('state', url.searchParams.get('state')!);
        callback.searchParams.set('code', 'test-code');
        callback.searchParams.set('client_id', CLIENT);
        const response = await realFetch(callback);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('cache-control'), 'no-store');
      }
      return true;
    },
  });
  return { auth, secrets, requests, authorizations, opened };
}

test('PKCE is fresh, high entropy, unpadded S256', () => {
  const first = createPkce();
  const second = createPkce();
  assert.match(first.verifier, /^[A-Za-z0-9_-]{43,128}$/);
  assert.equal(first.challenge, createHash('sha256').update(first.verifier).digest('base64url'));
  assert.notEqual(first.state, second.state);
  assert.notEqual(first.nonce, second.nonce);
  assert.notEqual(first.verifier, second.verifier);
});

test('registration and returning authorization use the correct public client contract', () => {
  const common = { hostId: 'host', appName: 'Type the Change', redirectUri: 'http://127.0.0.1:54321/auth/callback', state: 'state', nonce: 'nonce', challenge: 'challenge' };
  const initial = new URL(buildAuthorizationUrl(common));
  assert.equal(initial.origin, ISSUER);
  assert.equal(initial.pathname, '/api/accounts/authorize');
  assert.equal(initial.searchParams.get('client_id'), 'dynamic_agent_client');
  assert.equal(initial.searchParams.get('agent_name_hint'), 'Type the Change');
  assert.equal(initial.searchParams.get('scope'), PLAN_SCOPE);
  const returning = new URL(buildAuthorizationUrl({ ...common, clientId: CLIENT, idTokenHint: 'retained-hint' }));
  assert.equal(returning.searchParams.has('agent_name_hint'), false);
  assert.equal(returning.searchParams.get('client_id'), CLIENT);
  assert.equal(returning.searchParams.get('id_token_hint'), 'retained-hint');
  assert.throws(() => buildAuthorizationUrl({ ...common, redirectUri: 'http://localhost:54321/auth/callback' }), /loopback/);
  assert.throws(() => buildAuthorizationUrl({ ...common, redirectUri: 'https://127.0.0.1:54321/auth/callback' }), /loopback/);
});

test('callback state is checked first; issued client IDs cannot be substituted or omitted on registration', () => {
  assert.throws(() => validateCallback(new URLSearchParams('state=bad&error=access_denied'), 'expected', 'dynamic_agent_client'), /did not match/);
  assert.throws(() => validateCallback(new URLSearchParams('state=s&state=s&code=x&client_id=oaiapp_test'), 's', 'dynamic_agent_client'), /did not match/);
  assert.throws(() => validateCallback(new URLSearchParams('state=s&code=x'), 's', 'dynamic_agent_client'), /issued client/);
  assert.throws(() => validateCallback(new URLSearchParams('state=s&code=x&client_id=oaiapp_other'), 's', CLIENT), /different app/);
  assert.deepEqual(validateCallback(new URLSearchParams('state=s&code=x'), 's', CLIENT), { code: 'x', clientId: CLIENT });
  assert.throws(() => validateCallback(new URLSearchParams('state=s&code=x&code=y'), 's', CLIENT), /Invalid/);
});

test('plan permission requires both granted scopes, not identity login alone', () => {
  assert.equal(grantedPlanAccess(['openid', 'chatgpt.tokens.use.direct']), false);
  assert.equal(grantedPlanAccess(['openid', 'resource.invoke']), false);
  assert.equal(grantedPlanAccess(PLAN_SCOPE.split(' ')), true);
});

test('real loopback callback verifies signed identity and stores only this app’s account in SecretStorage', async () => {
  const { auth, secrets, authorizations, requests } = fixture();
  assert.deepEqual(await auth.status(), { signedIn: false, planAccess: false });
  assert.deepEqual(await auth.signIn(), { planAccess: true });
  assert.deepEqual(await auth.status(), { signedIn: true, planAccess: true });
  assert.equal(await auth.getAccessToken(), 'test-access');
  assert.equal(secrets.values.size, 2);
  assert.equal(secrets.account().clientId, CLIENT);
  assert.equal(secrets.account().subject, 'subject-1');
  assert.equal(authorizations[0].searchParams.get('ext_agent_host_id'), secrets.values.get(HOST));
  assert.match(secrets.values.get(HOST)!, /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(requests.filter(req => req.form.get('grant_type') === 'authorization_code').length, 1);
  await auth.signIn();
  assert.equal(authorizations[1].searchParams.get('client_id'), CLIENT);
  assert.ok(authorizations[1].searchParams.get('id_token_hint'));
  assert.equal(authorizations[1].searchParams.has('agent_name_hint'), false);
  assert.notEqual(authorizations[0].searchParams.get('state'), authorizations[1].searchParams.get('state'));
  assert.equal(authorizations[0].searchParams.get('ext_agent_host_id'), authorizations[1].searchParams.get('ext_agent_host_id'));
});

test('unregistered legacy bare host UUIDs gain the required URN prefix', async () => {
  const { auth, secrets, authorizations } = fixture();
  const legacyHost = 'e63fc739-28be-4bfd-b564-431ef6b036d1';
  secrets.values.set(HOST, legacyHost);
  await auth.signIn();
  assert.equal(secrets.values.get(HOST), `urn:uuid:${legacyHost}`);
  assert.equal(authorizations[0].searchParams.get('ext_agent_host_id'), `urn:uuid:${legacyHost}`);
  assert.equal(authorizations[0].searchParams.get('client_id'), 'dynamic_agent_client');
});

test('registered legacy host IDs remain byte-exact with their account and client binding', async () => {
  const { auth, secrets, authorizations } = fixture();
  await auth.signIn();
  const account = secrets.account();
  const legacyHost = 'e63fc739-28be-4bfd-b564-431ef6b036d1';
  secrets.values.set(HOST, legacyHost);
  await auth.signIn();
  assert.equal(secrets.values.get(HOST), legacyHost);
  assert.equal(authorizations[1].searchParams.get('ext_agent_host_id'), legacyHost);
  assert.equal(authorizations[1].searchParams.get('client_id'), account.clientId);
  assert.equal(secrets.account().subject, account.subject);
  assert.equal(authorizations[1].searchParams.get('id_token_hint'), account.idToken);
  await auth.signIn();
  assert.equal(authorizations[2].searchParams.get('ext_agent_host_id'), legacyHost);
});

test('pending legacy registrations preserve their issued client and exact host ID on retry', async () => {
  const { auth, secrets, authorizations } = fixture({ authorizationErrorOnce: true });
  await assert.rejects(auth.signIn(), /Sign in again/);
  const legacyHost = 'e63fc739-28be-4bfd-b564-431ef6b036d1';
  secrets.values.set(HOST, legacyHost);
  await auth.signIn();
  assert.equal(secrets.values.get(HOST), legacyHost);
  assert.equal(authorizations[1].searchParams.get('ext_agent_host_id'), legacyHost);
  assert.equal(authorizations[1].searchParams.get('client_id'), CLIENT);
});

test('existing supported host identifiers remain stable across sign-ins', async () => {
  for (const hostId of ['urn:uuid:e63fc739-28be-4bfd-b564-431ef6b036d1', 'urn:ietf:params:oauth:jwk-thumbprint:sha-256:test-thumbprint', 'did:key:test-key']) {
    const { auth, secrets, authorizations } = fixture();
    secrets.values.set(HOST, hostId);
    await auth.signIn();
    assert.equal(secrets.values.get(HOST), hostId);
    assert.equal(authorizations[0].searchParams.get('ext_agent_host_id'), hostId);
    mock.restoreAll();
  }
});

test('invalid JWT signature, nonce or audience never saves credentials', async () => {
  for (const options of [{ nonce: 'wrong' }, { audience: 'oaiapp_someone_else' }, { invalidSignature: true }]) {
    const { auth, secrets } = fixture(options);
    await assert.rejects(auth.signIn(), /Could not verify/);
    assert.equal(secrets.values.has(ACCOUNT), false);
    mock.restoreAll();
  }
});

test('identity-only grant remains signed in but cannot be used for inference', async () => {
  const { auth } = fixture({ scope: 'openid profile email' });
  assert.deepEqual(await auth.signIn(), { planAccess: false });
  assert.deepEqual(await auth.status(), { signedIn: true, planAccess: false });
  await assert.rejects(auth.getAccessToken(), /Allow this app/);
});

test('failed initial code exchange retries the issued registration without falsely signing in', async () => {
  const { auth, authorizations } = fixture({ authorizationErrorOnce: true });
  await assert.rejects(auth.signIn(), /Sign in again/);
  assert.deepEqual(await auth.status(), { signedIn: false, planAccess: false });
  await auth.signIn();
  assert.equal(authorizations[1].searchParams.get('client_id'), CLIENT);
  assert.equal(authorizations[1].searchParams.has('agent_name_hint'), false);
  assert.equal(authorizations[1].searchParams.has('id_token_hint'), false);
});

test('returning sign-in cannot replace a registration with a different subject', async () => {
  const options = { subject: 'subject-1' };
  const { auth, secrets } = fixture(options);
  await auth.signIn();
  options.subject = 'subject-2';
  await assert.rejects(auth.signIn(), /Could not verify/);
  assert.equal(secrets.account().subject, 'subject-1');
});

test('refresh is coalesced, preserves omitted scope, and stores rotated credentials together', async () => {
  const { auth, secrets, requests } = fixture();
  await auth.signIn();
  secrets.expire();
  const values = await Promise.all(Array.from({ length: 12 }, () => auth.getAccessToken()));
  assert.deepEqual(new Set(values), new Set(['refreshed-access']));
  assert.equal(requests.filter(req => req.form.get('grant_type') === 'refresh_token').length, 1);
  assert.equal(secrets.account().refreshToken, 'rotated-refresh');
  assert.deepEqual(await auth.status(), { signedIn: true, planAccess: true });
});

test('invalid refresh clears session tokens and never exposes provider error bodies', async () => {
  const { auth, secrets } = fixture({ refreshError: true });
  await auth.signIn();
  secrets.expire();
  await assert.rejects(auth.getAccessToken(), error => {
    assert.match(String(error), /Sign in again/);
    assert.doesNotMatch(String(error), /secret-must-not-appear/);
    return true;
  });
  assert.equal(secrets.account().accessToken, undefined);
  assert.equal(secrets.account().refreshToken, undefined);
  assert.equal(secrets.account().clientId, CLIENT);
  assert.deepEqual(await auth.status(), { signedIn: false, planAccess: false });
});

test('cancelled refresh caller does not discard the rotating replacement token', async () => {
  const { auth, secrets } = fixture();
  await auth.signIn();
  secrets.expire();
  const controller = new AbortController();
  const cancelled = auth.getAccessToken(controller.signal);
  const surviving = auth.getAccessToken();
  controller.abort();
  await assert.rejects(cancelled, /cancelled/);
  assert.equal(await surviving, 'refreshed-access');
  assert.equal(secrets.account().refreshToken, 'rotated-refresh');
});

test('cancelling browser sign-in closes the callback listener and saves no credentials', async () => {
  const { auth, secrets, opened } = fixture({ preventCallback: true });
  const controller = new AbortController();
  const pending = auth.signIn(controller.signal);
  const url = await opened;
  controller.abort();
  await assert.rejects(pending, /cancelled/);
  assert.equal(secrets.values.has(ACCOUNT), false);
  await assert.rejects(realFetch(url.searchParams.get('redirect_uri')!));
});

test('wrong-state callback is rejected without consuming the active sign-in', async () => {
  const { auth, opened } = fixture({ preventCallback: true });
  const pending = auth.signIn();
  const url = await opened;
  const callback = new URL(url.searchParams.get('redirect_uri')!);
  callback.searchParams.set('state', 'wrong-state');
  callback.searchParams.set('code', 'test-code');
  callback.searchParams.set('client_id', CLIENT);
  assert.equal((await realFetch(callback)).status, 400);
  callback.searchParams.set('state', url.searchParams.get('state')!);
  assert.equal((await realFetch(callback)).status, 200);
  assert.deepEqual(await pending, { planAccess: true });
});

test('sign-out revokes the session and retains only registration metadata for next sign-in', async () => {
  const { auth, secrets, requests, authorizations } = fixture();
  await auth.signIn();
  const host = secrets.values.get(HOST);
  await auth.signOut();
  const revoke = requests.find(req => req.url.endsWith('/revoke'))!;
  assert.equal(revoke.form.get('client_id'), CLIENT);
  assert.equal(revoke.form.get('token_type_hint'), 'refresh_token');
  assert.equal(revoke.form.get('token'), 'test-refresh');
  assert.equal(secrets.account().idToken, undefined);
  assert.equal(secrets.account().accessToken, undefined);
  assert.equal(secrets.account().refreshToken, undefined);
  assert.equal(secrets.values.get(HOST), host);
  assert.deepEqual(await auth.status(), { signedIn: false, planAccess: false });
  await auth.signIn();
  assert.equal(authorizations[1].searchParams.get('client_id'), CLIENT);
  assert.equal(authorizations[1].searchParams.has('id_token_hint'), false);
});

test('failed remote revocation still clears local tokens and explicitly reports the limitation', async () => {
  const { auth, secrets } = fixture({ revokeError: true });
  await auth.signIn();
  await assert.rejects(auth.signOut(), /Signed out locally.*revocation was not confirmed/);
  assert.equal(secrets.account().refreshToken, undefined);
  assert.deepEqual(await auth.status(), { signedIn: false, planAccess: false });
});

test('sign-out waits for a rotating refresh, then revokes the replacement', async () => {
  const { auth, secrets, requests } = fixture();
  await auth.signIn();
  secrets.expire();
  const refreshing = auth.getAccessToken();
  const rejected = assert.rejects(refreshing, /signing out/);
  while (!requests.some(req => req.form.get('grant_type') === 'refresh_token')) await new Promise(resolve => setTimeout(resolve, 1));
  await auth.signOut();
  await rejected;
  assert.equal(requests.find(req => req.url.endsWith('/revoke'))!.form.get('token'), 'rotated-refresh');
  assert.equal(secrets.account().accessToken, undefined);
});

test('oversized auth responses are rejected before parsing or opening the browser', async () => {
  for (const advertised of [true, false]) {
    mock.method(globalThis, 'fetch', async () => new Response('x'.repeat(300_000), { headers: advertised ? { 'Content-Length': '300000' } : {} }));
    const auth = new ChatGPTAuth({ secrets: new MemorySecrets(), appName: 'Type the Change', openExternal: async () => assert.fail('Browser must not open') });
    await assert.rejects(auth.signIn(), /too large/);
    mock.restoreAll();
  }
});

test('discovery refuses substituted endpoints before opening a browser', async () => {
  let opened = false;
  mock.method(globalThis, 'fetch', async () => Response.json({
    issuer: ISSUER, authorization_endpoint: `${ISSUER}/api/accounts/authorize`,
    token_endpoint: 'https://attacker.invalid/token', revocation_endpoint: `${ISSUER}/api/accounts/oauth/revoke`,
    jwks_uri: `${ISSUER}/.well-known/jwks.json`,
  }));
  const auth = new ChatGPTAuth({ secrets: new MemorySecrets(), appName: 'Type the Change', openExternal: async () => { opened = true; return true; } });
  await assert.rejects(auth.signIn(), /configuration changed/);
  assert.equal(opened, false);
});

test('pre-cancelled auth does not contact OpenAI or open a callback listener',async()=>{
 const {auth,secrets,requests}=fixture();const controller=new AbortController();controller.abort();
 await assert.rejects(auth.signIn(controller.signal),error=>error instanceof Error&&error.name==='AbortError');
 assert.equal(requests.length,0);assert.equal(secrets.values.size,0);
});

test('declined sign-in never exchanges a code and closes the callback listener',async()=>{
 const {auth,opened,requests,secrets}=fixture({preventCallback:true});
 const pending=auth.signIn();const rejected=assert.rejects(pending,/not completed/);const url=await opened;
 const callback=new URL(url.searchParams.get('redirect_uri')!);callback.searchParams.set('state',url.searchParams.get('state')!);callback.searchParams.set('error','access_denied');
 assert.equal((await realFetch(callback)).status,400);await rejected;
 assert.equal(requests.some(r=>r.url.endsWith('/token')),false);assert.equal(secrets.values.has(ACCOUNT),false);
 await assert.rejects(realFetch(callback));
});

test('non-callback requests do not consume a pending login',async()=>{
 const {auth,opened}=fixture({preventCallback:true});const pending=auth.signIn();const url=await opened;
 const callback=new URL(url.searchParams.get('redirect_uri')!);callback.searchParams.set('state',url.searchParams.get('state')!);callback.searchParams.set('code','test-code');callback.searchParams.set('client_id',CLIENT);
 assert.equal((await realFetch(callback,{method:'POST',body:'ignored'})).status,400);
 const wrongPath=new URL(callback);wrongPath.pathname='/other';assert.equal((await realFetch(wrongPath)).status,400);
 assert.equal((await realFetch(callback)).status,200);assert.deepEqual(await pending,{planAccess:true});
});

test('double sign-in is rejected; sign-out cancels the existing browser flow cleanly',async()=>{
 const {auth,opened,secrets}=fixture({preventCallback:true});const pending=auth.signIn();const rejected=assert.rejects(pending,error=>error instanceof Error&&error.name==='AbortError');
 const url=await opened;await assert.rejects(auth.signIn(),/in progress/);await auth.signOut();await rejected;
 assert.deepEqual(await auth.status(),{signedIn:false,planAccess:false});assert.equal(secrets.values.has(ACCOUNT),false);
 await assert.rejects(realFetch(url.searchParams.get('redirect_uri')!));
});

test('browser failures are sanitized and close the loopback listener',async()=>{
 for(const reject of [false,true]){
  const {secrets}=fixture();let callback='';
  const auth=new ChatGPTAuth({secrets,appName:'Type the Change',openExternal:async url=>{callback=new URL(url).searchParams.get('redirect_uri')!;if(reject)throw Error('private-id-token-hint');return false;}});
  await assert.rejects(auth.signIn(),error=>{assert.match(String(error),/Could not open/);assert.doesNotMatch(String(error),/private-id-token/);return true;});
  await assert.rejects(realFetch(callback));assert.equal(secrets.values.has(ACCOUNT),false);mock.restoreAll();
 }
});

test('invalid access token metadata never creates a saved account',async()=>{
 for(const tokenOverrides of [{expires_in:0},{expires_in:'3600'},{token_type:'MAC'},{access_token:42},{id_token:null}]){
  const {auth,secrets}=fixture({tokenOverrides});await assert.rejects(auth.signIn());assert.equal(secrets.values.has(ACCOUNT),false);mock.restoreAll();
 }
});

test('revoked plan scope is persisted and prevents subsequent inference',async()=>{
 const {auth,secrets,requests}=fixture({refreshScopes:'openid profile email'});await auth.signIn();secrets.expire();
 await assert.rejects(auth.getAccessToken(),/permission was removed/);assert.deepEqual(await auth.status(),{signedIn:true,planAccess:false});
 assert.equal(secrets.account().refreshToken,'rotated-refresh');const calls=requests.length;
 await assert.rejects(auth.getAccessToken(),/Allow this app/);assert.equal(requests.length,calls);
});

test('expired non-renewable sessions require a new login without making a refresh request',async()=>{
 const {auth,secrets,requests}=fixture();await auth.signIn();const account=secrets.account();delete account.refreshToken;account.expiresAt=0;secrets.values.set(ACCOUNT,JSON.stringify(account));
 const count=requests.length;await assert.rejects(auth.getAccessToken(),/expired/);assert.equal(requests.length,count);
});

test('sign-out recovers corrupted SecretStorage without pretending remote revocation succeeded',async()=>{
 const {auth,secrets}=fixture();secrets.values.set(ACCOUNT,'{invalid');
 await assert.rejects(auth.status(),/saved ChatGPT session is invalid/);
 await assert.rejects(auth.signOut(),/Signed out locally.*revocation was not confirmed/);
 assert.equal(secrets.values.has(ACCOUNT),false);assert.deepEqual(await auth.status(),{signedIn:false,planAccess:false});
 assert.deepEqual(await auth.signIn(),{planAccess:true});
});

test('cancellation during discovery remains AbortError and does not open a browser',async()=>{
 let started!:()=>void;const pendingRequest=new Promise<void>(resolve=>{started=resolve;});
 mock.method(globalThis,'fetch',async(_url:string,init:RequestInit)=>new Promise<Response>((_resolve,reject)=>{started();init.signal!.addEventListener('abort',()=>reject(Error('private-transport-detail')),{once:true});}));
 let opened=false;const auth=new ChatGPTAuth({secrets:new MemorySecrets(),appName:'Type the Change',openExternal:async()=>{opened=true;return true;}});
 const controller=new AbortController(),pending=auth.signIn(controller.signal);await pendingRequest;controller.abort();
 await assert.rejects(pending,error=>error instanceof Error&&error.name==='AbortError');assert.equal(opened,false);
});
