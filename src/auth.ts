import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { createLocalJWKSet, errors, jwtVerify, type JSONWebKeySet } from 'jose';

// Official OSS SIWC flow, not Codex's private session or an API-key fallback.
// https://developers.openai.com/siwc/token-sharing-open-source/sign-in
const ISSUER = 'https://auth.openai.com';
const DISCOVERY = `${ISSUER}/.well-known/openid-configuration`;
const AUTHORIZE = `${ISSUER}/api/accounts/authorize`;
const TOKEN = `${ISSUER}/api/accounts/oauth/token`;
const REVOKE = `${ISSUER}/api/accounts/oauth/revoke`;
const JWKS = `${ISSUER}/.well-known/jwks.json`;
const RESOURCE = 'https://api.openai.com/v1';
const DYNAMIC_CLIENT = 'dynamic_agent_client';
const SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const ACCOUNT_KEY = 'typeTheChange.chatgpt.account.v1';
const HOST_KEY = 'typeTheChange.chatgpt.host.v1';
const REGISTRATION_KEY = 'typeTheChange.chatgpt.registration.v1';
const MAX_BODY = 256 * 1024;
const NETWORK_TIMEOUT = 15_000;
const SIGN_IN_TIMEOUT = 10 * 60_000;

export interface SecretStore {
  get(key: string): PromiseLike<string | undefined>;
  store(key: string, value: string): PromiseLike<void>;
  delete(key: string): PromiseLike<void>;
}

export interface ChatGPTAuthOptions {
  secrets: SecretStore;
  openExternal: (url: string) => PromiseLike<boolean>;
  appName: string;
}

interface Account {
  version: 1;
  clientId: string;
  subject: string;
  nonce: string;
  email?: string;
  idToken?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  scopes: string[];
}

interface Tokens {
  idToken?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  scopes: string[];
}

class AuthError extends Error {
  constructor(message: string, readonly oauthCode?: string) { super(message); }
}

export function createPkce() {
  const verifier = randomBytes(64).toString('base64url');
  return {
    verifier,
    challenge: createHash('sha256').update(verifier).digest('base64url'),
    state: randomBytes(32).toString('base64url'),
    nonce: randomBytes(32).toString('base64url'),
  };
}

export function grantedPlanAccess(scopes: readonly string[]): boolean {
  return scopes.includes('chatgpt.tokens.use.direct') && scopes.includes('resource.invoke');
}

function exactValue(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function validateCallback(params: URLSearchParams, state: string, pendingClientId: string) {
  // Authenticate the callback before accepting errors, codes, or client IDs.
  if (params.getAll('state').length !== 1 || !exactValue(params.get('state') ?? '', state)) {
    throw new AuthError('The sign-in response did not match this request.');
  }
  for (const name of ['code', 'error', 'client_id']) {
    if (params.getAll(name).length > 1) throw new AuthError('Invalid sign-in response.');
  }
  if (params.has('error')) throw new AuthError('ChatGPT sign-in was not completed.');
  const code = params.get('code');
  const returnedClient = params.get('client_id');
  const clientId = returnedClient ?? pendingClientId;
  if (!code || code.length > 8192 || !/^oaiapp_[A-Za-z0-9_-]{1,256}$/.test(clientId)) {
    throw new AuthError('The sign-in response is missing a valid code or issued client ID.');
  }
  if (pendingClientId !== DYNAMIC_CLIENT && clientId !== pendingClientId) {
    throw new AuthError('The sign-in response belongs to a different app registration.');
  }
  return { code, clientId };
}

export function buildAuthorizationUrl(input: {
  clientId?: string; hostId: string; appName: string; redirectUri: string;
  state: string; nonce: string; challenge: string; idTokenHint?: string;
}) {
  const redirect = new URL(input.redirectUri);
  if (redirect.protocol !== 'http:' || redirect.hostname !== '127.0.0.1' || !redirect.port ||
      redirect.pathname !== '/auth/callback' || redirect.search || redirect.hash || redirect.username || redirect.password) {
    throw new AuthError('Sign-in requires a local loopback callback.');
  }
  const url = new URL(AUTHORIZE);
  const clientId = input.clientId ?? DYNAMIC_CLIENT;
  const params: Record<string, string> = {
    client_id: clientId, ext_agent_host_id: input.hostId, response_type: 'code',
    redirect_uri: input.redirectUri, scope: SCOPES, resource: RESOURCE,
    state: input.state, nonce: input.nonce,
    code_challenge_method: 'S256', code_challenge: input.challenge,
  };
  if (clientId === DYNAMIC_CLIENT) params.agent_name_hint = input.appName;
  else if (input.idTokenHint) params.id_token_hint = input.idTokenHint;
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AuthError('Invalid OpenAI response.');
  return value as Record<string, unknown>;
}

function checkAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new AuthError('ChatGPT request cancelled.');
}

function deadline(parent: AbortSignal | undefined, milliseconds: number) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (parent?.aborted) abort();
  else parent?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, milliseconds);
  timer.unref();
  return {
    controller, signal: controller.signal,
    dispose() { clearTimeout(timer); parent?.removeEventListener('abort', abort); },
  };
}

async function request(url: string, init: RequestInit, signal?: AbortSignal, empty = false): Promise<unknown> {
  if (![DISCOVERY, TOKEN, REVOKE, JWKS].includes(url)) throw new AuthError('Unexpected authentication endpoint.');
  const limit = deadline(signal, NETWORK_TIMEOUT);
  try {
    checkAborted(limit.signal);
    const response = await fetch(url, { ...init, redirect: 'error', signal: limit.signal });
    if (Number(response.headers.get('content-length')) > MAX_BODY) {
      await response.body?.cancel();
      throw new AuthError('OpenAI response is too large.');
    }
    let size = 0;
    const chunks: Uint8Array[] = [];
    const reader = response.body?.getReader();
    if (reader) {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_BODY) { await reader.cancel(); throw new AuthError('OpenAI response is too large.'); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
    }
    const body = Buffer.concat(chunks).toString('utf8');
    if (!response.ok) {
      let code: string | undefined;
      try {
        const supplied = object(JSON.parse(body)).error;
        if (['invalid_grant', 'invalid_client', 'access_denied', 'invalid_scope'].includes(String(supplied))) code = String(supplied);
      } catch { /* Never include provider bodies or tokens in errors. */ }
      throw new AuthError(`OpenAI authentication failed (${response.status}).${code === 'invalid_grant' ? ' Sign in again.' : ''}`, code);
    }
    if (empty) return undefined;
    try { return JSON.parse(body); } catch { throw new AuthError('Invalid OpenAI response.'); }
  } catch (error) {
    if (limit.signal.aborted) throw new AuthError(signal?.aborted ? 'ChatGPT request cancelled.' : 'OpenAI authentication timed out.');
    if (error instanceof AuthError) throw error;
    throw new AuthError('Could not contact OpenAI authentication.');
  } finally { limit.dispose(); }
}

function parseTokens(value: unknown, previousScopes?: string[]): Tokens {
  const data = object(value);
  if (data.token_type !== undefined && String(data.token_type).toLowerCase() !== 'bearer') throw new AuthError('Unsupported token type.');
  const scopes = typeof data.scope === 'string' ? data.scope.split(/\s+/).filter(Boolean) : (previousScopes ?? []);
  const optional = (key: string): string | undefined => {
    if (data[key] === undefined) return undefined;
    if (typeof data[key] !== 'string' || !data[key] || data[key].length > MAX_BODY) throw new AuthError('Invalid token response.');
    return data[key];
  };
  const accessToken = optional('access_token');
  if (accessToken && (typeof data.expires_in !== 'number' || !Number.isFinite(data.expires_in) || data.expires_in <= 0 || data.expires_in > 365 * 86400)) {
    throw new AuthError('Invalid access-token expiry.');
  }
  return {
    idToken: optional('id_token'), accessToken, refreshToken: optional('refresh_token'), scopes,
    expiresAt: accessToken ? Date.now() + Number(data.expires_in) * 1000 : undefined,
  };
}

function withoutTokens(account: Account): Account {
  return { version: 1, clientId: account.clientId, subject: account.subject, nonce: account.nonce, email: account.email, scopes: [] };
}

async function waitWithSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  checkAborted(signal);
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const abort = () => { cleanup(); reject(new AuthError('ChatGPT request cancelled.')); };
    const cleanup = () => signal.removeEventListener('abort', abort);
    signal.addEventListener('abort', abort, { once: true });
    promise.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  });
}

export class ChatGPTAuth {
  private pendingSignIn?: Promise<{ planAccess: boolean }>;
  private signInController?: AbortController;
  private pendingRefresh?: Promise<string>;
  private refreshController?: AbortController;
  private signingOut = false;
  private discoveryChecked = false;
  private keys?: { at: number; resolve: ReturnType<typeof createLocalJWKSet> };

  constructor(private readonly options: ChatGPTAuthOptions) {
    if (!options.appName.trim() || options.appName.length > 100) throw new AuthError('A valid app name is required.');
  }

  async status(): Promise<{ signedIn: boolean; planAccess: boolean }> {
    const account = await this.load();
    const signedIn = !this.signingOut && Boolean(account?.idToken);
    return { signedIn, planAccess: signedIn && Boolean(account?.accessToken) && grantedPlanAccess(account?.scopes ?? []) };
  }

  signIn(signal?: AbortSignal): Promise<{ planAccess: boolean }> {
    if (this.pendingSignIn || this.signingOut || this.pendingRefresh) return Promise.reject(new AuthError('Another ChatGPT account operation is in progress.'));
    const limit = deadline(signal, SIGN_IN_TIMEOUT);
    this.signInController = limit.controller;
    const pending = this.performSignIn(limit.signal).finally(() => {
      limit.dispose(); this.pendingSignIn = undefined; this.signInController = undefined;
    });
    this.pendingSignIn = pending;
    return pending;
  }

  async getAccessToken(signal?: AbortSignal): Promise<string> {
    checkAborted(signal);
    if (this.signingOut) throw new AuthError('ChatGPT is signing out.');
    const account = await this.load();
    checkAborted(signal);
    if (this.signingOut || this.pendingSignIn) throw new AuthError('Another ChatGPT account operation is in progress.');
    if (!account?.idToken || !account.accessToken) throw new AuthError('Continue with ChatGPT first.');
    if (!grantedPlanAccess(account.scopes)) throw new AuthError('Allow this app to use your ChatGPT plan when signing in.');
    if (account.expiresAt && account.expiresAt > Date.now() + 60_000) return account.accessToken;
    if (!account.refreshToken) throw new AuthError('Your ChatGPT session expired. Sign in again.');
    if (!this.pendingRefresh) {
      this.refreshController = new AbortController();
      // Caller cancellation must not abandon a rotating refresh token mid-save.
      this.pendingRefresh = this.refresh(account, this.refreshController.signal).finally(() => {
        this.pendingRefresh = undefined; this.refreshController = undefined;
      });
    }
    const token = await waitWithSignal(this.pendingRefresh, signal);
    if (this.signingOut) throw new AuthError('ChatGPT is signing out.');
    return token;
  }

  async signOut(): Promise<void> {
    if (this.signingOut) throw new AuthError('ChatGPT is already signing out.');
    this.signingOut = true;
    this.signInController?.abort();
    // Finish an already-started bounded refresh so revocation uses the latest
    // rotating token; cancelling after the server rotates could lose that token.
    let unconfirmed = false;
    try {
      await Promise.allSettled([this.pendingSignIn, this.pendingRefresh].filter(Boolean));
      const account = await this.load();
      if (account?.refreshToken) {
        try {
          await this.discovery();
          const body = new URLSearchParams({ token: account.refreshToken, token_type_hint: 'refresh_token', client_id: account.clientId });
          for (let attempt = 0; ; attempt++) {
            try { await request(REVOKE, { method: 'POST', body }, undefined, true); break; }
            catch (error) {
              if (attempt >= 1) throw error;
              await new Promise(resolve => setTimeout(resolve, 250));
            }
          }
        } catch { unconfirmed = true; }
      }
      if (account) await this.options.secrets.store(ACCOUNT_KEY, JSON.stringify(withoutTokens(account)));
      else await this.options.secrets.delete(ACCOUNT_KEY);
    } finally { this.signingOut = false; }
    if (unconfirmed) throw new AuthError('Signed out locally. Remote revocation was not confirmed; disconnect this app in ChatGPT Settings.');
  }

  private async load(): Promise<Account | undefined> {
    const saved = await this.options.secrets.get(ACCOUNT_KEY);
    if (!saved) return undefined;
    try {
      const value = object(JSON.parse(saved));
      if (value.version !== 1 || typeof value.clientId !== 'string' || !/^oaiapp_[A-Za-z0-9_-]{1,256}$/.test(value.clientId) ||
          typeof value.subject !== 'string' || !value.subject || typeof value.nonce !== 'string' ||
          !Array.isArray(value.scopes) || !value.scopes.every(scope => typeof scope === 'string')) throw new Error();
      for (const name of ['idToken', 'accessToken', 'refreshToken', 'email']) {
        if (value[name] !== undefined && typeof value[name] !== 'string') throw new Error();
      }
      if (value.expiresAt !== undefined && (typeof value.expiresAt !== 'number' || !Number.isFinite(value.expiresAt))) throw new Error();
      return value as unknown as Account;
    } catch { throw new AuthError('The saved ChatGPT session is invalid. Remove this extension’s saved account and sign in again.'); }
  }

  private async discovery(signal?: AbortSignal) {
    if (this.discoveryChecked) return;
    const data = object(await request(DISCOVERY, {}, signal));
    if (data.issuer !== ISSUER || data.authorization_endpoint !== AUTHORIZE || data.token_endpoint !== TOKEN ||
        data.jwks_uri !== JWKS || data.revocation_endpoint !== REVOKE) throw new AuthError('OpenAI authentication configuration changed. Update this extension.');
    this.discoveryChecked = true;
  }

  private async identity(idToken: string, clientId: string, nonce: string | undefined, subject: string | undefined, signal?: AbortSignal) {
    await this.discovery(signal);
    const getKeys = async (force = false) => {
      if (!this.keys || force || Date.now() - this.keys.at > 10 * 60_000) {
        const data = object(await request(JWKS, {}, signal));
        if (!Array.isArray(data.keys)) throw new AuthError('Invalid OpenAI signing keys.');
        this.keys = { at: Date.now(), resolve: createLocalJWKSet(data as unknown as JSONWebKeySet) };
      }
      return this.keys.resolve;
    };
    const verify = async (force = false) => jwtVerify(idToken, await getKeys(force), {
      issuer: ISSUER, audience: clientId, algorithms: ['RS256'], requiredClaims: ['sub', 'exp', 'iat'], clockTolerance: 5,
    });
    try {
      let result;
      try { result = await verify(); }
      catch (error) { if (!(error instanceof errors.JWKSNoMatchingKey)) throw error; result = await verify(true); }
      const payload = result.payload;
      if (typeof payload.sub !== 'string' || !payload.sub || (subject && payload.sub !== subject) ||
          (nonce !== undefined && payload.nonce !== nonce) ||
          (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== clientId) ||
          (payload.azp !== undefined && payload.azp !== clientId)) throw new Error();
      return { subject: payload.sub, email: typeof payload.email === 'string' ? payload.email : undefined, nonce: payload.nonce };
    } catch (error) {
      if (error instanceof AuthError) throw error;
      throw new AuthError('Could not verify the ChatGPT account. Sign in again.');
    }
  }

  private async performSignIn(signal: AbortSignal): Promise<{ planAccess: boolean }> {
    checkAborted(signal);
    const previous = await this.load();
    // A code exchange can fail after dynamic registration succeeded. Reuse that
    // issued client on retry, without treating it as a verified account yet.
    const pendingRegistration = await this.options.secrets.get(REGISTRATION_KEY);
    const registeredClient = pendingRegistration && /^oaiapp_[A-Za-z0-9_-]{1,256}$/.test(pendingRegistration)
      ? pendingRegistration : undefined;
    await this.discovery(signal);
    let hostId = await this.options.secrets.get(HOST_KEY);
    if (!hostId) { hostId = randomUUID(); await this.options.secrets.store(HOST_KEY, hostId); }
    checkAborted(signal);
    const pkce = createPkce();
    const pendingClientId = previous?.clientId ?? registeredClient ?? DYNAMIC_CLIENT;
    let server: Server | undefined;
    let removeAbort = () => {};
    try {
      let accept!: (value: ReturnType<typeof validateCallback>) => void;
      let reject!: (error: Error) => void;
      const callback = new Promise<ReturnType<typeof validateCallback>>((resolve, fail) => { accept = resolve; reject = fail; });
      // Attach immediately so browser-open failure/cancellation cannot create an unhandled rejection.
      void callback.catch(() => {});
      let consumed = false;
      let redirectUri = '';
      server = createServer({ maxHeaderSize: 16_384 }, (req, res) => {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
        res.setHeader('Referrer-Policy', 'no-referrer');
        const fail = () => { res.writeHead(400); res.end('Invalid sign-in callback.'); };
        if (!redirectUri || req.method !== 'GET' || !req.url || req.url.length > 16_384 || consumed) return fail();
        const expected = new URL(redirectUri);
        let received: URL;
        try { received = new URL(req.url, redirectUri); } catch { return fail(); }
        if (req.headers.host !== expected.host || received.origin !== expected.origin || received.pathname !== expected.pathname) return fail();
        if (received.searchParams.getAll('state').length !== 1 || !exactValue(received.searchParams.get('state') ?? '', pkce.state)) return fail();
        consumed = true;
        try {
          const result = validateCallback(received.searchParams, pkce.state, pendingClientId);
          res.end('Return to VS Code to continue.');
          accept(result);
        } catch (error) {
          fail(); reject(error instanceof AuthError ? error : new AuthError('Invalid sign-in response.'));
        }
      });
      server.requestTimeout = 5_000;
      server.headersTimeout = 5_000;
      await new Promise<void>((resolve, fail) => {
        server!.once('error', fail);
        server!.listen(0, '127.0.0.1', () => { server!.removeListener('error', fail); resolve(); });
      });
      server.on('error', () => reject(new AuthError('The local sign-in callback failed.')));
      const address = server.address();
      if (!address || typeof address === 'string') throw new AuthError('Could not start the local sign-in callback.');
      redirectUri = `http://127.0.0.1:${address.port}/auth/callback`;
      const abort = () => reject(new AuthError('ChatGPT sign-in cancelled or timed out.'));
      signal.addEventListener('abort', abort, { once: true });
      removeAbort = () => signal.removeEventListener('abort', abort);
      checkAborted(signal);
      const url = buildAuthorizationUrl({
        clientId: pendingClientId === DYNAMIC_CLIENT ? undefined : pendingClientId, hostId, appName: this.options.appName, redirectUri,
        state: pkce.state, nonce: pkce.nonce, challenge: pkce.challenge, idTokenHint: previous?.idToken,
      });
      // Never log this URL: returning sign-ins may contain an ID-token hint.
      let opened: boolean;
      try { opened = await waitWithSignal(Promise.resolve(this.options.openExternal(url)), signal); }
      catch { checkAborted(signal); throw new AuthError('Could not open ChatGPT sign-in in your browser.'); }
      if (!opened) throw new AuthError('Could not open ChatGPT sign-in in your browser.');
      const result = await callback;
      checkAborted(signal);
      if (!previous) await this.options.secrets.store(REGISTRATION_KEY, result.clientId);
      const tokens = parseTokens(await request(TOKEN, {
        method: 'POST', body: new URLSearchParams({
          grant_type: 'authorization_code', client_id: result.clientId, code: result.code,
          code_verifier: pkce.verifier, redirect_uri: redirectUri, resource: RESOURCE,
        }),
      }, signal));
      if (!tokens.idToken) throw new AuthError('The sign-in response did not contain an identity token.');
      const identity = await this.identity(tokens.idToken, result.clientId, pkce.nonce, previous?.subject, signal);
      checkAborted(signal);
      const account: Account = { version: 1, clientId: result.clientId, subject: identity.subject, email: identity.email, nonce: pkce.nonce, ...tokens };
      await this.options.secrets.store(ACCOUNT_KEY, JSON.stringify(account));
      await this.options.secrets.delete(REGISTRATION_KEY);
      return { planAccess: Boolean(account.accessToken) && grantedPlanAccess(account.scopes) };
    } finally {
      removeAbort();
      if (server) { server.close(); server.closeAllConnections(); }
    }
  }

  private async refresh(account: Account, signal: AbortSignal): Promise<string> {
    try {
      const tokens = parseTokens(await request(TOKEN, {
        method: 'POST', body: new URLSearchParams({ grant_type: 'refresh_token', client_id: account.clientId, refresh_token: account.refreshToken!, resource: RESOURCE }),
      }, signal), account.scopes);
      if (!tokens.accessToken) throw new AuthError('The refreshed session did not include an access token. Sign in again.');
      if (tokens.idToken) {
        const identity = await this.identity(tokens.idToken, account.clientId, undefined, account.subject, signal);
        if (identity.nonce !== undefined && identity.nonce !== account.nonce) throw new AuthError('Could not verify the refreshed ChatGPT account.');
      }
      checkAborted(signal);
      const next: Account = { ...account, ...tokens, idToken: tokens.idToken ?? account.idToken, refreshToken: tokens.refreshToken ?? account.refreshToken };
      await this.options.secrets.store(ACCOUNT_KEY, JSON.stringify(next));
      if (!grantedPlanAccess(next.scopes)) throw new AuthError('ChatGPT plan permission was removed. Sign in again.');
      return next.accessToken!;
    } catch (error) {
      if (error instanceof AuthError && error.oauthCode === 'invalid_grant') {
        await this.options.secrets.store(ACCOUNT_KEY, JSON.stringify(withoutTokens(account)));
      }
      throw error;
    }
  }
}
