import { expect, test } from "bun:test";
import { quietHoursEnd, quietHoursSchema, notificationMatchesVisibleDiscussion } from "@/lib/notifications/quiet-hours";
import { describeDeviceSession } from "@/lib/auth/device-session-label";

const preferences = { enabled: true, startMinute: 22*60, endMinute: 7*60, timeZone: "Asia/Jakarta" };
test("overnight quiet hours end at 07:00 WIB, with exclusive end", () => {
 expect(quietHoursEnd(preferences,new Date("2026-11-26T16:00:00Z"))?.toISOString()).toBe("2026-11-27T00:00:00.000Z");
 expect(quietHoursEnd(preferences,new Date("2026-11-27T00:00:00Z"))).toBeNull();
 expect(quietHoursEnd({...preferences, enabled:false},new Date("2026-11-26T16:00:00Z"))).toBeNull();
});
test("same-day quiet window and invalid settings", () => {
 expect(quietHoursEnd({...preferences,startMinute:12*60,endMinute:13*60},new Date("2026-11-26T05:30:00Z"))?.toISOString()).toBe("2026-11-26T06:00:00.000Z");
 expect(quietHoursSchema.safeParse({...preferences,timeZone:"invalid"}).success).toBe(false);
 expect(quietHoursSchema.safeParse({...preferences,endMinute:preferences.startMinute}).success).toBe(false);
});
test("quiet hours use the selected time zone at a DST transition", () => {
 expect(quietHoursEnd({enabled:true,startMinute:60,endMinute:180,timeZone:"America/New_York"},new Date("2026-03-08T06:30:00Z"))?.toISOString()).toBe("2026-03-08T07:00:00.000Z");
});
test("only suppress the visible matching discussion", () => {
 const location={pathname:"/discussions",search:"?thread=abc"};
 expect(notificationMatchesVisibleDiscussion("/discussions?thread=abc&message=123",location,true)).toBe(true);
 expect(notificationMatchesVisibleDiscussion("/discussions?thread=xyz",location,true)).toBe(false);
 expect(notificationMatchesVisibleDiscussion("/discussions?thread=abc",location,false)).toBe(false);
});
test("native and browser user agents have readable labels", () => {
 expect(describeDeviceSession("Mozilla Android ZyxMobileApp/1.2 (Capacitor)")).toBe("Zyx Academy · Android");
 expect(describeDeviceSession("Mozilla Windows Chrome/132")).toBe("Chrome · Windows");
});
