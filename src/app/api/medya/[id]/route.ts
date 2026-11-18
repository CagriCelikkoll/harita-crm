// Gelen medyanın dosyası: oturum ve çalışma alanı denetimli (başka çalışma alanının medyası 404). Content-Type dosyanın
// içeriğinden değil, kayıttaki MIME beyaz listesinden; nosniff ve sandbox CSP ile tarayıcı içeriği başka türde
// yorumlayamaz. Görseller satır içi gösterilir (?indir=1 ile iner); belge, ses ve video her zaman dosya olarak iner
// (oynatıcı yine çalar). Tek parçalı Range isteği 206 ile yanıtlanır: Safari video oynatmak ve ileri sarmak için ister.
import fs from "node:fs";
import { Readable } from "node:stream";
import { bulunamadi, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { medyaDosyasi } from "@/server/servisler/medya";
import { aralikCoz } from "@/server/servisler/medya-dosyalari";

export async function GET(istek: Request, { params }: RouteContext<"/api/medya/[id]">) {
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const { id } = await params;
  const d = medyaDosyasi(ctx, id);
  if (!d) return bulunamadi();
  const satirIci = d.gorunum === "gorsel" && new URL(istek.url).searchParams.get("indir") !== "1";
  const ascii = d.dosyaAdi.replace(/[^\x20-\x7e]/g, "_");
  const basliklar: Record<string, string> = {
    "Content-Type": d.mime,
    "Content-Disposition": `${satirIci ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(d.dosyaAdi)}`,
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Cache-Control": "private, max-age=3600",
  };
  const aralik = aralikCoz(istek.headers.get("range"), d.boyut);
  if (aralik === "gecersiz") {
    return new Response(null, { status: 416, headers: { ...basliklar, "Content-Range": `bytes */${d.boyut}` } });
  }
  const { bas, son } = aralik ?? { bas: 0, son: d.boyut - 1 };
  const govde =
    d.boyut === 0 ? null : (Readable.toWeb(fs.createReadStream(d.tam, { start: bas, end: son })) as ReadableStream<Uint8Array>);
  return new Response(govde, {
    status: aralik ? 206 : 200,
    headers: {
      ...basliklar,
      "Content-Length": String(d.boyut === 0 ? 0 : son - bas + 1),
      ...(aralik ? { "Content-Range": `bytes ${bas}-${son}/${d.boyut}` } : {}),
    },
  });
}
