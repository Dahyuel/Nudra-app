import http from 'node:http';

const port = Number(process.env.PORT || 8080);
const apiBase = (process.env.API_INTERNAL_URL || 'http://api:3001').replace(/\/$/, '');
const sharedSecret = process.env.DOMAIN_AUTH_SHARED_SECRET || '';
const validDomain = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

if (sharedSecret.length < 32) {
  throw new Error('DOMAIN_AUTH_SHARED_SECRET must contain at least 32 characters');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
    res.end('ok');
    return;
  }

  const hostname = (url.searchParams.get('domain') || '').toLowerCase();
  if (req.method !== 'GET' || url.pathname !== '/authorize' || !validDomain.test(hostname)) {
    res.writeHead(403, { 'cache-control': 'no-store' });
    res.end();
    return;
  }

  try {
    const authorizeUrl = new URL('/api/domains/authorize', apiBase);
    authorizeUrl.searchParams.set('domain', hostname);
    const response = await fetch(authorizeUrl, {
      method: 'GET',
      headers: { 'X-Nudra-Domain-Auth': sharedSecret },
      signal: AbortSignal.timeout(5000),
      redirect: 'error',
    });
    res.writeHead(response.status === 200 ? 200 : 403, { 'cache-control': 'no-store' });
    res.end();
  } catch {
    // Fail closed if the API is unavailable; do not reveal upstream details.
    res.writeHead(403, { 'cache-control': 'no-store' });
    res.end();
  }
});

server.listen(port, '0.0.0.0');
