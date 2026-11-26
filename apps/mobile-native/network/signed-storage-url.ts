export function signedStoragePutUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.hash &&
      url.searchParams.get("X-Amz-Algorithm") === "AWS4-HMAC-SHA256" &&
      /^[a-f0-9]{64}$/.test(url.searchParams.get("X-Amz-Signature") ?? "") ? url.href : null;
  } catch { return null; }
}
