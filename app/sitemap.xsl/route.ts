import { SITEMAP_REVALIDATE_SECONDS } from "@/lib/sitemap-utils";

export const runtime = "nodejs";
export const revalidate = 3600;

const stylesheet = `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:sitemap="http://www.sitemaps.org/schemas/sitemap/0.9">
  <xsl:output method="html" encoding="UTF-8" indent="yes"/>

  <xsl:template match="/">
    <html lang="en">
      <head>
        <title>Joya Medical Supplies Sitemap</title>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <style>
          :root {
            color-scheme: light;
            --bg: #f7faf8;
            --panel: #ffffff;
            --ink: #10251c;
            --muted: #64746d;
            --line: #dbe7df;
            --accent: #0b7a4b;
            --accent-soft: #e4f5ed;
          }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            background: radial-gradient(circle at top left, #e9f8ef 0, transparent 34rem), var(--bg);
            color: var(--ink);
            font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            line-height: 1.5;
          }
          main {
            width: min(1120px, calc(100vw - 32px));
            margin: 48px auto;
          }
          header {
            margin-bottom: 24px;
          }
          .eyebrow {
            color: var(--accent);
            font-size: 13px;
            font-weight: 700;
            letter-spacing: .08em;
            margin: 0 0 8px;
            text-transform: uppercase;
          }
          h1 {
            font-size: clamp(32px, 5vw, 54px);
            letter-spacing: -.04em;
            line-height: 1;
            margin: 0 0 10px;
          }
          .summary {
            color: var(--muted);
            font-size: 16px;
            margin: 0;
          }
          table {
            width: 100%;
            background: var(--panel);
            border: 1px solid var(--line);
            border-collapse: separate;
            border-radius: 18px;
            border-spacing: 0;
            box-shadow: 0 18px 40px rgba(16, 37, 28, .08);
            overflow: hidden;
          }
          th, td {
            border-bottom: 1px solid var(--line);
            padding: 14px 18px;
            text-align: left;
            vertical-align: top;
          }
          tr:last-child td { border-bottom: 0; }
          th {
            background: var(--accent-soft);
            color: #244536;
            font-size: 12px;
            letter-spacing: .06em;
            text-transform: uppercase;
          }
          a {
            color: var(--accent);
            font-weight: 650;
            overflow-wrap: anywhere;
            text-decoration-thickness: 1px;
            text-underline-offset: 3px;
          }
          a:hover { color: #085f3b; }
          .empty {
            background: var(--panel);
            border: 1px solid var(--line);
            border-radius: 18px;
            color: var(--muted);
            padding: 22px;
          }
          .meta { color: var(--muted); white-space: nowrap; }
          @media (max-width: 720px) {
            main { margin: 28px auto; }
            table, thead, tbody, tr, th, td { display: block; }
            thead { display: none; }
            tr { border-bottom: 1px solid var(--line); }
            tr:last-child { border-bottom: 0; }
            td { border-bottom: 0; padding: 10px 14px; }
            td:before {
              color: var(--muted);
              content: attr(data-label);
              display: block;
              font-size: 12px;
              font-weight: 700;
              letter-spacing: .05em;
              margin-bottom: 3px;
              text-transform: uppercase;
            }
            .meta { white-space: normal; }
          }
        </style>
      </head>
      <body>
        <main>
          <xsl:choose>
            <xsl:when test="count(sitemap:sitemapindex/sitemap:sitemap) &gt; 0">
              <header>
                <p class="eyebrow">Sitemap Index</p>
                <h1>XML Sitemaps</h1>
                <p class="summary">
                  Click a sitemap below to view the URLs inside it.
                  Total sitemaps: <xsl:value-of select="count(sitemap:sitemapindex/sitemap:sitemap)"/>.
                </p>
              </header>
              <table>
                <thead>
                  <tr>
                    <th>Sitemap</th>
                    <th>Last Modified</th>
                  </tr>
                </thead>
                <tbody>
                  <xsl:for-each select="sitemap:sitemapindex/sitemap:sitemap">
                    <tr>
                      <td data-label="Sitemap">
                        <a href="{sitemap:loc}">
                          <xsl:value-of select="sitemap:loc"/>
                        </a>
                      </td>
                      <td class="meta" data-label="Last Modified">
                        <xsl:value-of select="sitemap:lastmod"/>
                      </td>
                    </tr>
                  </xsl:for-each>
                </tbody>
              </table>
            </xsl:when>
            <xsl:when test="count(sitemap:urlset/sitemap:url) &gt; 0">
              <header>
                <p class="eyebrow">Sitemap URLs</p>
                <h1>URL List</h1>
                <p class="summary">
                  Click a URL to open the page. Total URLs:
                  <xsl:value-of select="count(sitemap:urlset/sitemap:url)"/>.
                </p>
              </header>
              <table>
                <thead>
                  <tr>
                    <th>URL</th>
                    <th>Last Modified</th>
                    <th>Change Frequency</th>
                    <th>Priority</th>
                  </tr>
                </thead>
                <tbody>
                  <xsl:for-each select="sitemap:urlset/sitemap:url">
                    <tr>
                      <td data-label="URL">
                        <a href="{sitemap:loc}">
                          <xsl:value-of select="sitemap:loc"/>
                        </a>
                      </td>
                      <td class="meta" data-label="Last Modified">
                        <xsl:value-of select="sitemap:lastmod"/>
                      </td>
                      <td class="meta" data-label="Change Frequency">
                        <xsl:value-of select="sitemap:changefreq"/>
                      </td>
                      <td class="meta" data-label="Priority">
                        <xsl:value-of select="sitemap:priority"/>
                      </td>
                    </tr>
                  </xsl:for-each>
                </tbody>
              </table>
            </xsl:when>
            <xsl:otherwise>
              <header>
                <p class="eyebrow">Sitemap</p>
                <h1>No URLs Found</h1>
              </header>
              <p class="empty">This sitemap loaded, but it does not currently contain any URLs.</p>
            </xsl:otherwise>
          </xsl:choose>
        </main>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>`;

export function GET() {
  return new Response(stylesheet, {
    headers: {
      "Content-Type": "text/xsl; charset=utf-8",
      "Cache-Control": `public, s-maxage=${SITEMAP_REVALIDATE_SECONDS}, stale-while-revalidate=86400`,
    },
  });
}
