// QWIZ-PARTY: fail-closed target selection for the existing 40-client load test.
// Never allows live-cloud credentials to be mixed with a self-hosted endpoint.
const RESERVED_HOSTS = new Set(['supabase.com', 'www.supabase.com']);

function isCloudHostname(hostname) {
  const host = hostname.toLowerCase();
  return host === 'supabase.co' || host.endsWith('.supabase.co') ||
    RESERVED_HOSTS.has(host) || host.endsWith('.supabase.com');
}

function assertPublicKey(key) {
  if (!key) throw Error('QWIZ_LOAD_KEY must be set to a publishable or anon key');
  if (key.startsWith('sb_secret_') || key.startsWith('sb_service_role_')) {
    throw Error('Do not use a secret/service-role key in the 40-client test');
  }
  if (key.startsWith('sb_publishable_')) return;
  // Legacy self-hosted anon JWT is accepted only when its role is explicitly anon.
  const parts = key.split('.');
  if (parts.length !== 3) throw Error('Only a publishable key or an anon JWT is allowed');
  try {
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (claims.role !== 'anon') throw Error('JWT must have anon role');
  } catch (error) {
    throw Error('Invalid anon JWT: ' + error.message);
  }
}

export function resolveLoadTarget(env, cloudUrl, cloudKey) {
  const target = env.QWIZ_LOAD_TARGET || 'cloud';
  if (target === 'cloud') {
    if (env.QWIZ_LOAD_URL || env.QWIZ_LOAD_KEY || env.QWIZ_LOAD_CONFIRM) {
      throw Error('Custom endpoint/key requires QWIZ_LOAD_TARGET=selfhost');
    }
    if (!cloudKey) throw Error('Cloud publishable key is missing');
    return {target, url: cloudUrl, key: cloudKey};
  }
  if (target !== 'selfhost') throw Error('QWIZ_LOAD_TARGET must be cloud or selfhost');
  if (env.QWIZ_LOAD_CONFIRM !== 'ISOLATED_SELFHOST_ONLY') {
    throw Error('Explicitly confirm the isolated self-hosted test target');
  }
  let address;
  try { address = new URL(env.QWIZ_LOAD_URL || ''); }
  catch { throw Error('QWIZ_LOAD_URL must be a valid absolute URL'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(address.hostname);
  if (isCloudHostname(address.hostname)) throw Error('Cloud Supabase host cannot be a self-hosted target');
  if (address.protocol !== 'https:' && !(local && address.protocol === 'http:')) {
    throw Error('The self-hosted API must use HTTPS, except on localhost');
  }
  if (address.username || address.password || address.pathname !== '/' || address.search || address.hash) {
    throw Error('Use the bare API origin without credentials, path, query, or fragment');
  }
  const key = String(env.QWIZ_LOAD_KEY || '').trim();
  assertPublicKey(key);
  return {target, url: address.origin, key};
}
