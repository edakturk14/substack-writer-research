#!/usr/bin/env node
// Node 24: offline by default; --network explicitly opts into public HTTP fetches.
// This is an auditable checker, not a claim that an unchecked URL is reachable.
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { demoArticles } from "../src/lib/fixtures.ts";

const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const network = process.argv.includes("--network");
const unknown = process.argv.slice(2).filter((arg) => arg !== "--network");
if (unknown.length) {
  console.error("Usage: node scripts/check-links.mjs [--network]");
  process.exit(2);
}

let failures = 0;
let checked = 0;
let unchecked = 0;
const urls = new Map();
function report(kind, source, message) {
  console.log(`${kind} ${source}: ${message}`);
  if (kind === "ERROR" || kind === "UNVERIFIED") failures++;
  if (kind === "UNCHECKED") unchecked++;
}

function record(raw, source, article) {
  try {
    const url = new URL(raw);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
      throw new Error("expected an HTTP(S) URL without credentials");
    }
    if (article && (
      url.protocol !== "https:"
      || !url.hostname.endsWith(".substack.com")
      || !url.pathname.startsWith("/p/")
    )) throw new Error("fixture must link directly to an HTTPS Substack article");
    const existing = urls.get(url.href);
    if (existing) {
      existing.sources.push(source);
      if (article) existing.article = article;
    } else {
      urls.set(url.href, { sources: [source], article });
    }
    checked++;
  } catch (error) {
    report("ERROR", source, `${raw}: ${error.message}`);
  }
}

if (!demoArticles.length) report("ERROR", "fixtures", "no articles to verify");
const seen = new Set();
for (const [index, article] of demoArticles.entries()) {
  const source = `fixture ${index + 1}`;
  if (typeof article.title !== "string" || !article.title.trim()
    || typeof article.excerpt !== "string" || !article.excerpt.trim()) {
    report("ERROR", source, "nonempty source title and excerpt required");
  }
  if (seen.has(article.url)) report("ERROR", source, "duplicate fixture URL");
  seen.add(article.url);
  record(article.url, source, article);
}

const readme = await readFile(path.join(root, "README.md"), "utf8");
// Common Markdown links and bare URLs (including inline code). Ignore fenced code.
const prose = readme.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, "");
const targets = new Set([
  ...Array.from(prose.matchAll(/!?\[[^\]]*\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\s*\)/g), (match) => match[1].replace(/^<|>$/g, "")),
  ...Array.from(prose.matchAll(/^\s*\[[^\]]+\]:\s*(<[^>]+>|\S+)/gm), (match) => match[1].replace(/^<|>$/g, "")),
  ...Array.from(prose.matchAll(/<(https?:\/\/[^>]+)>/g), (match) => match[1]),
  ...Array.from(prose.matchAll(/https?:\/\/[^\s<>"'`()\[\]]+/g), (match) => match[0].replace(/[.,;]+$/, "")),
]);
for (const target of targets) {
  if (/^https?:\/\//i.test(target)) {
    record(target, "README");
  } else if (/^(?:#|mailto:)/i.test(target)) {
    report("UNCHECKED", "README", `${target} (fragment/mail target, not HTTP)`);
  } else if (/^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith("//")) {
    report("ERROR", "README", `${target} (unsupported link scheme)`);
  } else {
    try {
      const [filename, fragment] = target.split("#");
      const resolved = path.resolve(root, decodeURIComponent(filename.split("?")[0]));
      if (!resolved.startsWith(`${root}${path.sep}`) && resolved !== root) {
        throw new Error("path escapes repository");
      }
      await stat(resolved);
      checked++;
      report("OK", "README", `${target} (local target exists)`);
      if (fragment) report("UNCHECKED", "README", `${target} (fragment not validated)`);
    } catch (error) {
      report("ERROR", "README", `${target}: ${error.message}`);
    }
  }
}

function normalizedText(html) {
  const entities = {
    amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ",
    rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', ndash: "-", mdash: "-",
  };
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity) => {
      if (entity[0] !== "#") return entities[entity.toLowerCase()] ?? whole;
      const number = entity[1].toLowerCase() === "x"
        ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return number <= 0x10ffff ? String.fromCodePoint(number) : whole;
    })
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchBounded(original, source) {
  // One deadline covers redirects, headers and streamed body, with no retries.
  const signal = AbortSignal.timeout(12_000);
  let current = original;
  for (let redirects = 0; redirects <= 5; redirects++) {
    const response = await fetch(current, {
      signal,
      redirect: "manual",
      headers: { "user-agent": "SubstackWriterResearch-LinkVerifier/1.0" },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) throw new Error(`HTTP ${response.status} missing Location`);
      const next = new URL(location, current);
      if (!["https:", "http:"].includes(next.protocol) || next.username || next.password) {
        throw new Error("unsafe redirect target");
      }
      report("REDIRECT", source, `${response.status} ${current} -> ${next.href}`);
      current = next.href;
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`HTTP ${response.status} at ${current}`);
    }
    const reader = response.body?.getReader();
    const chunks = [];
    let bytes = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 2_000_000) {
          await reader.cancel();
          throw new Error("body exceeds 2 MB verification limit");
        }
        chunks.push(Buffer.from(value));
      }
    }
    return { status: response.status, url: current, html: Buffer.concat(chunks).toString("utf8") };
  }
  throw new Error("more than five redirects");
}

for (const [url, { sources, article }] of urls) {
  const source = sources.join(", ");
  const hostname = new URL(url).hostname;
  if (["localhost", "127.0.0.1", "[::1]"].includes(hostname)) {
    report("UNCHECKED", source, `${url} (local development URL)`);
    continue;
  }
  if (!network) {
    report("UNCHECKED", source, `${url} (syntax valid; reachability and source text not fetched)`);
    continue;
  }
  try {
    const result = await fetchBounded(url, source);
    checked++;
    report("OK", source, `HTTP ${result.status} ${result.url}`);
    if (article) {
      const text = normalizedText(result.html);
      for (const field of ["title", "excerpt"]) {
        const expected = normalizedText(article[field] ?? "");
        if (expected && text.includes(expected)) {
          report("OK", source, `${field} found in fetched source text`);
        } else {
          report("UNVERIFIED", source, `${field} not found in fetched HTML; manual source review needed`);
        }
      }
    }
  } catch (error) {
    report("ERROR", source, `${url}: ${error.message}`);
  }
}

console.log(`Summary: ${checked} checks passed; ${unchecked} unchecked; ${failures} errors/unverified.`);
if (!network) console.log("Offline only. Optional live audit: node scripts/check-links.mjs --network");
process.exitCode = failures ? 1 : 0;
