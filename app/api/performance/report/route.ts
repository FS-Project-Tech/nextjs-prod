/**
 * GET /api/performance/report
 *
 * Generate performance report from collected metrics
 */

import { NextRequest, NextResponse } from "next/server";
import {
  generatePerformanceReport,
  formatReportAsMarkdown,
  exportReportToFile,
} from "@/lib/monitoring/performance-reporter";
import { requirePerformanceApiKey } from "@/lib/internal-performance-auth";

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Disabled" }, { status: 403 });
  }

  const denied = requirePerformanceApiKey(req);
  if (denied) return denied;

  try {
    const searchParams = req.nextUrl.searchParams;
    const timeWindowMs = searchParams.get("window")
      ? parseInt(searchParams.get("window")!)
      : undefined;

    const format = searchParams.get("format") || "json";
    const exportFile = searchParams.get("export") === "true";

    // Generate report
    const report = generatePerformanceReport(timeWindowMs);

    // Export to file if requested
    if (exportFile) {
      const filepath = await exportReportToFile(report);
      return NextResponse.json({
        success: true,
        message: "Report exported to file",
        filepath,
        report,
      });
    }

    // Return in requested format
    if (format === "markdown") {
      const markdown = formatReportAsMarkdown(report);
      return new NextResponse(markdown, {
        headers: {
          "Content-Type": "text/markdown",
        },
      });
    }

    return NextResponse.json(report);
  } catch (error) {
    console.error("Error generating performance report:", error);
    return NextResponse.json(
      {
        error: "Failed to generate report",
        message: error instanceof Error ? error.message : "An error occurred",
      },
      { status: 500 }
    );
  }
}
