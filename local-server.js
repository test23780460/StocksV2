const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".sql": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "content-type": type,
    "x-content-type-options": "nosniff"
  });
  res.end(body);
}

function apiResponse(res) {
  return {
    setHeader: (key, value) => res.setHeader(key, value),
    status(code) {
      res.statusCode = code;
      return this;
    },
    json(body) {
      if (!res.headersSent) res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify(body));
    },
    end(body = "") {
      res.end(body);
    }
  };
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      if (!raw) resolve(undefined);
      else {
        try {
          resolve(JSON.parse(raw));
        } catch {
          resolve(raw);
        }
      }
    });
  });
}

async function serveApi(req, res, url) {
  const apiPath = url.pathname.replace(/^\/api\/?/, "");
  const candidates = [
    path.join(root, "api", `${apiPath}.js`),
    path.join(root, "api", apiPath, "index.js")
  ];
  const filePath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!filePath || !filePath.startsWith(path.join(root, "api"))) {
    send(res, 404, JSON.stringify({ error: "API route not found" }), mime[".json"]);
    return;
  }
  delete require.cache[require.resolve(filePath)];
  req.query = Object.fromEntries(url.searchParams.entries());
  req.body = await readBody(req);
  try {
    await require(filePath)(req, apiResponse(res));
  } catch (error) {
    send(res, error.statusCode || 500, JSON.stringify({ error: error.message }), mime[".json"]);
  }
}

function serveFile(req, res) {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname.startsWith("/api/")) {
    serveApi(req, res, url);
    return;
  }
  const cleanPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.join(root, cleanPath);
  if (!filePath.startsWith(root)) {
    send(res, 403, "Forbidden");
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      fs.readFile(path.join(root, "index.html"), (fallbackError, fallback) => {
        if (fallbackError) send(res, 404, "Not found");
        else send(res, 200, fallback, mime[".html"]);
      });
      return;
    }
    send(res, 200, data, mime[path.extname(filePath)] || "application/octet-stream");
  });
}

const server = http.createServer(serveFile);
const port = Number(process.env.PORT || 4173);
server.listen(port, () => {
  console.log(`Stocks V2 local preview: http://localhost:${port}`);
});
