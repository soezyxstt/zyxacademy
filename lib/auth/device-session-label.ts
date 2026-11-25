/** User agents are descriptive, never used as a device identity. */
export function describeDeviceSession(ua: string | null): string {
 const value = ua ?? "";
 const os = /Android/i.test(value) ? "Android" : /iPhone|iPad/i.test(value) ? "iOS" :
  /Windows/i.test(value) ? "Windows" : /Macintosh|Mac OS X/i.test(value) ? "macOS" :
  /Linux/i.test(value) ? "Linux" : "";
 const client = /ZyxMobileApp|ZyxDesktopApp/i.test(value) ? "Zyx Academy" :
  /Edg\//i.test(value) ? "Edge" : /Firefox\//i.test(value) ? "Firefox" :
  /Chrome\//i.test(value) ? "Chrome" : /Safari\//i.test(value) ? "Safari" : "";
 return [client, os].filter(Boolean).join(" · ");
}
