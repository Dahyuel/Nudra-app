import { createHash, randomBytes } from 'node:crypto';
import { promises as dns } from 'node:dns';
import { isIP } from 'node:net';
import { domainToASCII } from 'node:url';

export type DomainDnsRecord = { type: string; name: string; value: string; purpose: string };
type DnsResolver = Pick<typeof dns, 'resolve4' | 'resolveTxt'>;

export function normalizeHostname(input: string): string | null {
  const normalized = input.trim().replace(/\.$/, '').toLowerCase();
  if (!normalized || normalized.length > 253 || normalized.includes('/') || normalized.includes(':')) return null;
  const ascii = domainToASCII(normalized).toLowerCase();
  if (!ascii || ascii.length > 253 || isIP(ascii)) return null;
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(ascii)) return null;
  return ascii;
}

export function createDomainChallenge(domain: string, publicIpv4: string): { tokenHash: string; dnsRecords: DomainDnsRecord[] } {
  if (isIP(publicIpv4) !== 4) throw new Error('PUBLIC_IPV4 must be set to the VPS public IPv4 address');
  const token = randomBytes(24).toString('hex');
  const tokenValue = `nudra-verification=${token}`;
  return {
    tokenHash: createHash('sha256').update(tokenValue).digest('hex'),
    dnsRecords: [
      { type: 'A', name: '@', value: publicIpv4, purpose: 'Route this domain to the Nudra VPS' },
      { type: 'TXT', name: '_nudra-verification', value: tokenValue, purpose: `Verify ownership of ${domain}` },
    ],
  };
}

export async function verifyDomainChallenge(
  domain: string,
  tokenHash: string,
  publicIpv4: string,
  resolver: DnsResolver = dns,
): Promise<boolean> {
  if (isIP(publicIpv4) !== 4 || !/^[a-f0-9]{64}$/.test(tokenHash)) return false;
  try {
    const [addresses, textRecords] = await Promise.all([
      resolver.resolve4(domain),
      resolver.resolveTxt(`_nudra-verification.${domain}`),
    ]);
    const hasExpectedAddress = addresses.includes(publicIpv4);
    const hasChallenge = textRecords.some((chunks) =>
      createHash('sha256').update(chunks.join('')).digest('hex') === tokenHash);
    return hasExpectedAddress && hasChallenge;
  } catch {
    return false;
  }
}
