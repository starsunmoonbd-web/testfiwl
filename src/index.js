const STREAM_URL = "https://prod-linear-media.toffeelive.com/cdn/live/dw_tv/playlist.m3u8?edge-cache-token=Expires=1791907312~Starts=1791903712~URLPrefix=aHR0cHM6Ly9wcm9kLWxpbmVhci1tZWRpYS50b2ZmZWVsaXZlLmNvbQ~Data=eyJzdWJzY3JpYmVyX2lkIjoiMmYyNmEyZmYtODRkYS00NzRiLWJiN2EtMjFlY2VhZTIyNDBmIn0~Signature=B-KbE81E7wF4HM_Jvfx_NIXLN-gGtLpoivp6PrQGr5aUQqan6zDcgd3IcH5bsrBbdDLFiRbKJnbc2e5g2AyTCA";

const ALLOWED_HOST = "prod-linear-media.toffeelive.com";
const TOKEN = new URL(STREAM_URL).searchParams.get("edge-cache-token");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Cache-Control": "no-store"
};

function json(data,
