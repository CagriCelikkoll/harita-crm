// Gelen medyanın dosyası: oturum ve çalışma alanı denetimli (başka çalışma alanının medyası 404). Content-Type dosyanın
// içeriğinden değil, kayıttaki MIME beyaz listesinden; nosniff ve sandbox CSP ile tarayıcı içeriği başka türde
// yorumlayamaz. Görseller satır içi gösterilir (?indir=1 ile iner); belge ve ses her zaman dosya olarak iner (ses
// oynatıcısı yine çalar).
import fs from "node:fs";
import { Readable } from "node:stream";
import { bulunamadi, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { medyaDosyasi } from "@/server/servisler/medya";

export async function GET(istek: Request, { params }: RouteContext<"/api/medya/[id]">) {
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const { id } = await params;
  const d = medyaDosyasi(ctx, id);
  if (!d) return bulunamadi();
  const satirIci = d.gorunum === "gorsel" && new URL(istek.url).searchParams.get("indir") !== "1";
  const ascii = d.dosyaAdi.replace(/[^\x20-\x7e]/g, "_");
  return new Response(Readable.toWeb(fs.createReadStream(d.tam)) as ReadableStream<Uint8Array>, {
    headers: {
      "Content-Type": d.mime,
      "Content-Length": String(d.boyut),
      "Content-Disposition": `${satirIci ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(d.dosyaAdi)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
