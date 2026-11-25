import { eq, sql } from 'drizzle-orm';
import { getDatabase, olmosAppState } from './db.js';

const memoryInvoices = new Map();
const memoryDonations = [];

async function getStateValue(key) {
  const database = getDatabase();
  if (!database) return null;
  const [row] = await database
    .select({ value: olmosAppState.value })
    .from(olmosAppState)
    .where(eq(olmosAppState.key, key))
    .limit(1);
  return row?.value ?? null;
}

async function setStateValue(key, value) {
  const database = getDatabase();
  if (!database) return null;
  await database
    .insert(olmosAppState)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: olmosAppState.key,
      set: { value, updatedAt: new Date() },
    });
  return value;
}

function invoiceKey(ref) {
  return `developer-support-invoice:${String(ref || '')}`;
}

export async function saveDeveloperSupportInvoice(ref, invoice) {
  const key = invoiceKey(ref);
  if (getDatabase()) return setStateValue(key, invoice);
  memoryInvoices.set(key, invoice);
  return invoice;
}

export async function getDeveloperSupportInvoice(ref) {
  const key = invoiceKey(ref);
  return getDatabase() ? getStateValue(key) : memoryInvoices.get(key) || null;
}

export async function updateDeveloperSupportInvoice(ref, patch) {
  const current = await getDeveloperSupportInvoice(ref);
  if (!current) return null;
  const updated = { ...current, ...patch, updatedAt: Date.now() };
  await saveDeveloperSupportInvoice(ref, updated);
  return updated;
}

export async function getDeveloperSupportDonations() {
  const donations = getDatabase() ? await getStateValue('developer-support-donations') : memoryDonations;
  return Array.isArray(donations) ? donations : [];
}

export async function recordDeveloperSupportDonation(donation) {
  const database = getDatabase();
  if (!database) {
    if (!memoryDonations.some((entry) => entry.paymentChargeId === donation.paymentChargeId)) {
      memoryDonations.push(donation);
    }
    return { ok: true };
  }

  const key = 'developer-support-donations';
  const incoming = JSON.stringify([donation]);
  const dedupe = JSON.stringify([{ paymentChargeId: donation.paymentChargeId }]);
  await database
    .insert(olmosAppState)
    .values({ key, value: [donation], updatedAt: new Date() })
    .onConflictDoUpdate({
      target: olmosAppState.key,
      set: {
        value: sql`CASE WHEN ${olmosAppState.value} @> ${dedupe}::jsonb THEN ${olmosAppState.value} ELSE ${olmosAppState.value} || ${incoming}::jsonb END`,
        updatedAt: new Date(),
      },
    });
  return { ok: true };
}
