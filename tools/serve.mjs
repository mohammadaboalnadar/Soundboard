// Static server for UI work in a plain browser (Tauri APIs are mocked). Usage: node tools/serve.mjs [port]
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../src/", import.meta.url));
const port = Number(process.env.PORT) || Number(process.argv[2]) || 5174;
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".json": "application/json" };

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, "") || "index.html";
  if (rel.startsWith("..")) return res.writeHead(403).end();
  try {
    const body = await readFile(join(root, rel));
    res.writeHead(200, { "content-type": types[extname(rel)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(port, "localhost", () => console.log(`ui on http://localhost:${port}/?demo`));
