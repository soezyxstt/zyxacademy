/**
 * Google APIs Integration Smoke Test
 * Tests token refresh and API operations for:
 * 1. Google Forms API
 * 2. Google Meet API
 * 3. Google Sheets API
 *
 * Usage: bun run scripts/test-google-apis.ts
 */

import dotenv from "dotenv";
import path from "path";

if (process.env.ENV_FILE) {
  dotenv.config({ path: path.resolve(process.cwd(), process.env.ENV_FILE), override: true });
} else {
  dotenv.config({ path: path.resolve(process.cwd(), ".env.staging"), override: true });
}

import { getGoogleFormsAccessToken, createGoogleForm } from "@/lib/google-forms";
import { getGoogleMeetAccessToken, createGoogleMeetSpace } from "@/lib/google-meet";
import { createGoogleSpreadsheet } from "@/lib/google-sheets";

async function main() {
  console.log("==================================================");
  console.log("  GOOGLE WORKSPACE REST APIS INTEGRATION TEST     ");
  console.log("==================================================\n");

  const refreshToken =
    process.env.GOOGLE_REFRESH_TOKEN ||
    process.env.GOOGLE_FORMS_REFRESH_TOKEN ||
    process.env.GOOGLE_MEET_REFRESH_TOKEN;

  console.log("Using Refresh Token source:", process.env.GOOGLE_REFRESH_TOKEN ? "GOOGLE_REFRESH_TOKEN" : "Fallback");
  console.log("Client ID:", process.env.GOOGLE_CLIENT_ID || "NONE");
  console.log("Token prefix:", refreshToken ? refreshToken.slice(0, 15) + "..." : "NONE");
  console.log("");

  let passedCount = 0;

  // 1. Test Google Forms API & Token Exchange
  try {
    console.log("[1/3] Testing Google Forms API...");
    const formsToken = await getGoogleFormsAccessToken();
    console.log("  ✓ Token exchange successful (Forms)");
    const testForm = await createGoogleForm(`Zyx Test Form (${new Date().toISOString().slice(0, 10)})`);
    console.log(`  ✓ Form created successfully! ID: ${testForm.formId}`);
    console.log(`    URL: ${testForm.responderUri}`);
    passedCount++;
  } catch (err: any) {
    console.error("  ✗ Google Forms API test failed:", err.message || err);
  }

  console.log("");

  // 2. Test Google Meet API & Token Exchange
  try {
    console.log("[2/3] Testing Google Meet API...");
    const meetToken = await getGoogleMeetAccessToken();
    console.log("  ✓ Token exchange successful (Meet)");
    const testSpace = await createGoogleMeetSpace({ accessType: "OPEN" });
    console.log(`  ✓ Meet space created successfully! Name: ${testSpace.name}`);
    console.log(`    Meeting URI: ${testSpace.meetingUri}`);
    passedCount++;
  } catch (err: any) {
    console.error("  ✗ Google Meet API test failed:", err.message || err);
  }

  console.log("");

  // 3. Test Google Sheets API & Creation
  try {
    console.log("[3/3] Testing Google Sheets API...");
    const testSheet = await createGoogleSpreadsheet(
      `Smoke Test ${new Date().toISOString().slice(0, 10)}`,
      ["Nama", "Role", "Status"],
      [
        ["Tester", "Admin", "Active"],
        ["Test User 2", "Student", "Pending"],
      ]
    );
    console.log(`  ✓ Google Spreadsheet created successfully! ID: ${testSheet.spreadsheetId}`);
    console.log(`    URL: ${testSheet.spreadsheetUrl}`);
    passedCount++;
  } catch (err: any) {
    console.error("  ✗ Google Sheets API test failed:", err.message || err);
  }

  console.log("");
  console.log("==================================================");
  if (passedCount === 3) {
    console.log("  SUCCESS: All 3 Google APIs passed validation!");
    console.log("==================================================");
    process.exit(0);
  } else {
    console.error(`  FAILURE: Only ${passedCount}/3 Google APIs passed.`);
    console.log("==================================================");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unhandled error during test execution:", err);
  process.exit(1);
});
