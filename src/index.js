const ORIGIN = "http://line.tivi-one.net/play/live.php?mac=00:1A:79:B4:54:0F&stream=737323&extension=.m3u8";

const TOKEN_TTL = 5 * 60; // 5 minutes

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Token তৈরি
    if (url.pathname === "/token") {
      const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL;
      const token = await createToken(exp, env.SECRET);

      return new Response(
        JSON.stringify({
          token,
          expires: exp,
          expires_in: TOKEN_TTL,
          url: `${url.origin}/live.m3u8?token=${token}`
        }),
        {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store"
          }
        }
      );
    }

    // Token যাচাই
    if (url.pathname === "/live.m3u8") {
      const token = url.searchParams.get("token");

      if (!token) {
        return new Response("Missing token", { status: 401 });
      }

      const valid = await verifyToken(token, env.SECRET);

      if (!valid) {
        return new Response("Token expired or invalid", {
          status: 403
        });
      }

      const originUrl =
        `${ORIGIN}/live.m3u8`;

      const response = await fetch(originUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept": "*/*"
        }
      });

      if (!response.ok) {
        return new Response(
          `Origin error: ${response.status}`,
          { status: 502 }
        );
      }

      return new Response(response.body, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    return new Response("Not Found", { status: 404 });
  }
};


// =========================
// HMAC TOKEN
// =========================

async function createToken(exp, secret) {
  const data = String(exp);

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data)
  );

  return `${exp}.${base64url(signature)}`;
}


async function verifyToken(token, secret) {
  try {
    const [exp, signature] = token.split(".");

    if (!exp || !signature) return false;

    const expiry = Number(exp);

    if (!Number.isFinite(expiry)) return false;

    // ৫ মিনিট পার হলে invalid
    if (Math.floor(Date.now() / 1000) > expiry) {
      return false;
    }

    const expected = await createToken(expiry, secret);

    return timingSafeEqual(token, expected);

  } catch {
    return false;
  }
}


function base64url(buffer) {
  return btoa(
    String.fromCharCode(...new Uint8Array(buffer))
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}


function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;

  let result = 0;

  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
    }
