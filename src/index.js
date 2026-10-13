const STREAM = "https://prod-linear-media.toffeelive.com/cdn/live/dw_tv/playlist.m3u8?edge-cache-token=Expires=1791907312~Starts=1791903712~URLPrefix=aHR0cHM6Ly9wcm9kLWxpbmVhci1tZWRpYS50b2ZmZWVsaXZlLmNvbQ~Data=eyJzdWJzY3JpYmVyX2lkIjoiMmYyNmEyZmYtODRkYS00NzRiLWJiN2EtMjFlY2VhZTIyNDBmIn0~Signature=B-KbE81E7wF4HM_Jvfx_NIXLN-gGtLpoivp6PrQGr5aUQqan6zDcgd3IcH5bsrBbdDLFiRbKJnbc2e5g2AyTCA";

const HOST = "prod-linear-media.toffeelive.com";
const TOKEN = new URL(STREAM).searchParams.get("edge-cache-token");

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store"
  };
}

function proxyUrl(raw, base) {
  const u = new URL(raw, base);

  if (u.protocol !== "https:" || u.hostname !== HOST) {
    return raw;
  }

  if (!u.searchParams.has("edge-cache-token")) {
    u.searchParams.set("edge-cache-token", TOKEN);
  }

  return "/resource?url=" + encodeURIComponent(u.href);
}

export default {
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/") {
      return new Response(`<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DW TV</title>
<style>
body{margin:0;background:#000}
video{width:100%;height:100vh}
</style>
</head>
<body>
<video id="v" controls autoplay playsinline></video>
<script src="https://cdn.jsdelivr.net/npm/hls.js@1"></script>
<script>
const v=document.getElementById('v');
if(v.canPlayType('application/vnd.apple.mpegurl')){
  v.src='/playlist.m3u8';
}else if(Hls.isSupported()){
  const h=new Hls();
  h.loadSource('/playlist.m3u8');
  h.attachMedia(v);
}else{
  document.body.innerHTML='HLS is not supported in this browser';
}
</script>
</body>
</html>`, {
        headers: {
          "Content-Type": "text/html;charset=UTF-8",
          ...
