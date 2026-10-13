const STREAM_URL = "https://prod-linear-media.toffeelive.com/cdn/live/dw_tv/playlist.m3u8?edge-cache-token=Expires=1791907312~Starts=1791903712~URLPrefix=aHR0cHM6Ly9wcm9kLWxpbmVhci1tZWRpYS50b2ZmZWVsaXZlLmNvbQ~Data=eyJzdWJzY3JpYmVyX2lkIjoiMmYyNmEyZmYtODRkYS00NzRiLWJiN2EtMjFlY2VhZTIyNDBmIn0~Signature=B-KbE81E7wF4HM_Jvfx_NIXLN-gGtLpoivp6PrQGr5aUQqan6zDcgd3IcH5bsrBbdDLFiRbKJnbc2e5g2AyTCA";

const HOST = "prod-linear-media.toffeelive.com";

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return new Response(
        `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DW TV</title>
<style>
body{margin:0;background:#000}
video{width:100%;height:100vh;background:#000}
</style>
</head>
<body>
<video controls autoplay playsinline></video>
<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
<script>
const video=document.querySelector("video");
const source="/playlist.m3u8";
if(video.canPlayType("application/vnd.apple.mpegurl")){
 video.src=source;
}else if(Hls.isSupported()){
 const hls=new Hls();
 hls.loadSource(source);
 hls.attachMedia(video);
 hls.on(Hls.Events.ERROR,(_,data)=>{
   console.log("HLS error:",data);
 });
}else{
 document.body.innerHTML="HLS is not supported in this browser";
}
</script>
</body>
</html>`,
        {
          headers: {
            "Content-Type": "text/html;charset=UTF-8",
            "Cache-Control": "no-store"
          }
        }
      );
    }

    let target;

    if (url.pathname === "/playlist.m3u8") {
      target = new URL(STREAM_URL);
    } else if (url.pathname === "/segment") {
      const value = url.searchParams.get("url");

      if (!value) {
        return new Response("Missing URL", { status: 400 });
      }

      try {
        target = new URL(value);
      } catch {
        return new Response("Invalid URL", {
