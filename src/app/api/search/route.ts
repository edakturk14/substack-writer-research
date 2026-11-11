import { MAX_QUERY_LENGTH, type SearchErrorResponse } from "@/lib/contracts";
import { demoResponse } from "@/lib/fixtures";
import { readBoundedJson, searchExa, SearchError, withDeadline } from "@/lib/exa";
import { enrichSubstackArticles } from "@/lib/substack-access";

export const runtime = "nodejs";

function failure(error: SearchError): Response {
  const body: SearchErrorResponse = { error: { code: error.code, message: error.message } };
  return Response.json(body, { status: error.status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (contentType !== "application/json") {
      throw new SearchError("INVALID_CONTENT_TYPE", "Send a JSON request body.", 415);
    }
    let body: unknown;
    try {
      body = await withDeadline(
        (signal) => readBoundedJson(request, 8192, signal, () => new SearchError(
          "REQUEST_TOO_LARGE", "The request body is too large.", 413,
        )),
        5000,
        () => new SearchError("REQUEST_TIMEOUT", "The request took too long. Please try again.", 408),
      );
    } catch (error) {
      if (error instanceof SearchError) throw error;
      throw new SearchError("INVALID_JSON", "Send a valid JSON request body.", 400);
    }
    if (body === null || typeof body !== "object" || Array.isArray(body) ||
      !("query" in body) || typeof body.query !== "string") {
      throw new SearchError("INVALID_QUERY", "Enter a research question of 1–300 characters.", 400);
    }
    const query = body.query.trim();
    if (!query || query.length > MAX_QUERY_LENGTH || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(query)) {
      throw new SearchError("INVALID_QUERY", "Enter a research question of 1–300 characters.", 400);
    }
    const result = process.env.DEMO_MODE === "1" ? demoResponse : await searchExa(query);
    if (result.mode === "live") result.results = await enrichSubstackArticles(result.results);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error instanceof SearchError ? error : new SearchError(
      "SEARCH_UNAVAILABLE", "Search is temporarily unavailable. Please try again.", 503,
    ));
  }
}
