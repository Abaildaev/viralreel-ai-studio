/** Timing-safe comparison of two byte strings. */
export function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
}

/**
 * Compares two secrets without leaking how much of the prefix matched — or how
 * long the expected value is, since both sides are hashed to a fixed width
 * first.
 */
export async function secretEquals(
  provided: string | null | undefined,
  expected: string | null | undefined,
): Promise<boolean> {
  if (!provided || !expected) return false;
  const [providedDigest, expectedDigest] = await Promise.all([
    sha256(provided),
    sha256(expected),
  ]);
  return constantTimeEqual(providedDigest, expectedDigest);
}
