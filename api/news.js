const { createConnectedProvider } = require("../lib/providerContract");
const { listNews, saveNews } = require("../lib/repository");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=900");
  try {
    const symbol = req.query.symbol;
    const provider = createConnectedProvider();
    const liveArticles = await provider.getNews(symbol);
    if (liveArticles.length) await saveNews(liveArticles).catch(() => null);
    const stored = await listNews();
    res.status(200).json({
      mode: liveArticles.some((article) => article.provider !== "demo-provider") ? "Connected Data" : "Demo Mode",
      articles: liveArticles.length ? liveArticles : stored,
      disclaimer: "News sentiment is contextual market research and is not guaranteed price direction."
    });
  } catch (error) {
    res.status(503).json({ mode: "Temporarily unavailable", articles: [], error: error.message });
  }
};
