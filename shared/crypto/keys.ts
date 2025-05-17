import sodium from "libsodium-wrappers";

export type KxKeyPair = {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
};

export async function generateOrRestoreKeyPair(): Promise<KxKeyPair> {
  await sodium.ready;

  const stored = localStorage.getItem("keypair");
  if (stored) {
    const parsed = JSON.parse(stored);
    return {
      publicKey: sodium.from_base64(
        parsed.publicKey,
        sodium.base64_variants.ORIGINAL
      ),
      privateKey: sodium.from_base64(
        parsed.privateKey,
        sodium.base64_variants.ORIGINAL
      ),
    };
  }

  const kp = sodium.crypto_kx_keypair();
  localStorage.setItem(
    "keypair",
    JSON.stringify({
      publicKey: sodium.to_base64(
        kp.publicKey,
        sodium.base64_variants.ORIGINAL
      ),
      privateKey: sodium.to_base64(
        kp.privateKey,
        sodium.base64_variants.ORIGINAL
      ),
    })
  );

  return kp;
}
