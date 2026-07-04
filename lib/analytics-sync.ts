import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { db } from "@/db";
import { pageAnalytics } from "@/db/schema";
import { env } from "@/lib/env";

export async function syncPopularPages(limit: number = 10) {
  // We use the env variables (if they exist).
  // Note: GA_CLIENT_EMAIL, GA_PRIVATE_KEY, GA_PROPERTY_ID should be defined in .env
  const clientEmail = process.env.GA_CLIENT_EMAIL;
  const privateKey = process.env.GA_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const propertyId = process.env.GA_PROPERTY_ID;

  if (!clientEmail || !privateKey || !propertyId) {
    console.warn("GA4 credentials or Property ID missing. Skipping analytics sync.");
    return { success: false, message: "Missing GA4 credentials" };
  }

  try {
    const analyticsDataClient = new BetaAnalyticsDataClient({
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
    });

    const [response] = await analyticsDataClient.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [
        {
          startDate: "30daysAgo",
          endDate: "today",
        },
      ],
      dimensions: [
        { name: "pagePath" },
        { name: "pageTitle" },
      ],
      metrics: [
        { name: "screenPageViews" },
      ],
      orderBys: [
        {
          metric: { metricName: "screenPageViews" },
          desc: true,
        },
      ],
      limit: 100, // Fetch more to filter out unwanted paths and still get enough
    });

    if (!response.rows) {
      return { success: true, count: 0, message: "No rows returned from GA4" };
    }

    const processedPaths = new Set<string>();
    const toUpsert = [];

    for (const row of response.rows) {
      let path = row.dimensionValues?.[0]?.value;
      const title = row.dimensionValues?.[1]?.value;
      const viewsStr = row.metricValues?.[0]?.value;
      const views = parseInt(viewsStr || "0", 10);

      if (!path || !title || views === 0) continue;

      // Filter query string if any
      const queryIdx = path.indexOf("?");
      if (queryIdx !== -1) {
        path = path.substring(0, queryIdx);
      }

      // Filter out unwanted paths (e.g., admin, api, sign-in, etc.)
      if (
        path.startsWith("/admin") ||
        path.startsWith("/api") ||
        path.startsWith("/sign-in") ||
        path.startsWith("/sign-up") ||
        path.startsWith("/sign-out") ||
        path === "/" // Typically we only want specific content/pages as popular
      ) {
        continue;
      }

      // Only take unique clean paths
      if (processedPaths.has(path)) continue;
      processedPaths.add(path);

      toUpsert.push({
        id: path,
        title: title.replace(" - Zyx Academy", "").trim(),
        views: views,
        updatedAt: new Date(),
      });

      if (toUpsert.length >= limit) break;
    }

    if (toUpsert.length > 0) {
      // Upsert into DB
      for (const item of toUpsert) {
        await db
          .insert(pageAnalytics)
          .values(item)
          .onConflictDoUpdate({
            target: pageAnalytics.id,
            set: {
              title: item.title,
              views: item.views,
              updatedAt: item.updatedAt,
            },
          });
      }
    }

    return { success: true, count: toUpsert.length, message: "Sync complete" };
  } catch (error) {
    console.error("Error syncing GA4 analytics:", error);
    return { success: false, message: "Failed to sync GA4 analytics", error };
  }
}
