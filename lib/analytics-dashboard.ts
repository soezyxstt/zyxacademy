import { BetaAnalyticsDataClient } from "@google-analytics/data";

export interface AnalyticsDashboardData {
  summary: {
    views: number;
    sessions: number;
    activeUsers: number;
  };
  dailyData: {
    date: string;
    views: number;
    sessions: number;
  }[];
  topPages: {
    path: string;
    title: string;
    views: number;
  }[];
}

export async function getDashboardMetrics(days: number = 30): Promise<AnalyticsDashboardData | null> {
  const clientEmail = process.env.GA_CLIENT_EMAIL;
  const privateKey = process.env.GA_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const propertyId = process.env.GA_PROPERTY_ID;

  if (!clientEmail || !privateKey || !propertyId) {
    console.warn("GA4 credentials or Property ID missing. Skipping analytics dashboard sync.");
    return null;
  }

  try {
    const analyticsDataClient = new BetaAnalyticsDataClient({
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
    });

    const property = `properties/${propertyId}`;
    const dateRanges = [{ startDate: `${days}daysAgo`, endDate: "today" }];

    // Run 3 separate requests or a batch report for efficiency.
    // For simplicity and speed, we will run batchRunReports
    const [response] = await analyticsDataClient.batchRunReports({
      property,
      requests: [
        {
          // Request 0: Summary metrics
          dateRanges,
          metrics: [
            { name: "screenPageViews" },
            { name: "sessions" },
            { name: "activeUsers" },
          ],
        },
        {
          // Request 1: Daily trends
          dateRanges,
          dimensions: [{ name: "date" }],
          metrics: [{ name: "screenPageViews" }, { name: "sessions" }],
          orderBys: [
            {
              dimension: { dimensionName: "date" },
              desc: false,
            },
          ],
        },
        {
          // Request 2: Top Pages
          dateRanges,
          dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
          metrics: [{ name: "screenPageViews" }],
          orderBys: [
            {
              metric: { metricName: "screenPageViews" },
              desc: true,
            },
          ],
          limit: 15,
        },
      ],
    });

    const reports = response.reports || [];

    // Parse Summary
    const summaryRows = reports[0]?.rows?.[0]?.metricValues || [];
    const summary = {
      views: parseInt(summaryRows[0]?.value || "0", 10),
      sessions: parseInt(summaryRows[1]?.value || "0", 10),
      activeUsers: parseInt(summaryRows[2]?.value || "0", 10),
    };

    // Parse Daily Trends
    const dailyData = (reports[1]?.rows || []).map((row) => {
      // Date format is YYYYMMDD, convert to YYYY-MM-DD
      const rawDate = row.dimensionValues?.[0]?.value || "";
      let formattedDate = rawDate;
      if (rawDate.length === 8) {
        formattedDate = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
      }

      return {
        date: formattedDate,
        views: parseInt(row.metricValues?.[0]?.value || "0", 10),
        sessions: parseInt(row.metricValues?.[1]?.value || "0", 10),
      };
    });

    // Parse Top Pages
    const topPages = [];
    for (const row of reports[2]?.rows || []) {
      let path = row.dimensionValues?.[0]?.value || "";
      const title = row.dimensionValues?.[1]?.value || "";
      const viewsStr = row.metricValues?.[0]?.value || "0";
      const views = parseInt(viewsStr, 10);

      const queryIdx = path.indexOf("?");
      if (queryIdx !== -1) {
        path = path.substring(0, queryIdx);
      }

      topPages.push({ path, title, views });
    }

    // Optional: filter out unique tops if needed, but GA4 already aggregates well.
    const uniqueTopsMap = new Map();
    for (const page of topPages) {
      if (!uniqueTopsMap.has(page.path)) {
        uniqueTopsMap.set(page.path, { ...page, title: page.title.replace(" - Zyx Academy", "").trim() });
      } else {
        uniqueTopsMap.get(page.path).views += page.views;
      }
    }
    const mergedTopPages = Array.from(uniqueTopsMap.values()).sort((a, b) => b.views - a.views).slice(0, 10);

    return {
      summary,
      dailyData,
      topPages: mergedTopPages,
    };
  } catch (error) {
    console.error("Error fetching GA4 dashboard metrics:", error);
    return null;
  }
}
