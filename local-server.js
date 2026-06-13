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

function serveFile(req, res) {
  const url = new URL(req.url, "http://localhost");
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
