const DEFAULT_URL = "http://localhost:3000";

export function getServiceUrl(): string {
  return (localStorage.getItem("service_url") ?? DEFAULT_URL).replace(/\/$/, "");
}

export function setServiceUrl(url: string): void {
  localStorage.setItem("service_url", url.replace(/\/$/, ""));
}

export function getServiceSecret(): string {
  return localStorage.getItem("service_secret") ?? "";
}

export function setServiceSecret(secret: string): void {
  localStorage.setItem("service_secret", secret);
}

/** Returns false only on first launch — when service_secret has never been set (null). */
export function isConnectionConfigured(): boolean {
  return localStorage.getItem("service_secret") !== null;
}

export function setConnectionSettings(url: string, secret: string): void {
  setServiceUrl(url);
  setServiceSecret(secret);
}
