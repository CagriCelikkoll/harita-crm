// web-push 4.0.0'ın kendi tür tanımı yok (@types/web-push ayrı paket; kurulmadı). Yalnızca kullanılan kısım.
declare module "web-push" {
  export type PushSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };
  export type VapidDetails = { subject: string; publicKey: string; privateKey: string };
  export type RequestOptions = {
    vapidDetails?: VapidDetails;
    TTL?: number;
    urgency?: "very-low" | "low" | "normal" | "high";
    topic?: string;
    contentEncoding?: "aes128gcm" | "aesgcm";
    headers?: Record<string, string>;
  };
  export type RequestDetails = {
    method: "POST";
    headers: Record<string, string | number>;
    body: Buffer | null;
    endpoint: string;
  };
  export function generateRequestDetails(subscription: PushSubscription, payload?: string | Buffer | null, options?: RequestOptions): RequestDetails;
  export function generateVAPIDKeys(): { publicKey: string; privateKey: string };
  export function encrypt(
    userPublicKey: string,
    userAuth: string,
    payload: string | Buffer,
    contentEncoding: "aes128gcm" | "aesgcm",
  ): { localPublicKey: Buffer; salt: string; cipherText: Buffer };
}
