// Çok süreçli işçi testi: aynı SQLite dosyasında, verilen andan itibaren işçi turlarını (tek işçi kilidiyle sırayla)
// çalıştırır ve kendi sağlayıcısının gönderdiği adresleri JSON olarak yazdırır.
// Kullanım: node --conditions=react-server --import tsx isci-sureci.ts <simdiMs> <baslangicMs>   (DATABASE_PATH ile)
import type { GonderimSonucu, Ileti, MessageProvider } from "../../src/server/messaging/saglayici";
import { isciTuru } from "../../src/server/servisler/isci";

const [simdiMetni, baslangicMetni] = process.argv.slice(2);
const gonderilen: string[] = [];
const saglayici: MessageProvider = {
  ad: "surec",
  kanal: "eposta",
  sandbox: true,
  async gonder(ileti: Ileti): Promise<GonderimSonucu> {
    gonderilen.push(ileti.alici);
    await new Promise((r) => setTimeout(r, 2));
    return { durum: "gonderildi" };
  },
};

while (Date.now() < Number(baslangicMetni)) {
  /* ortak başlangıç anını bekle */
}
// Tek işçi kilidi: kilidi başka süreç tutuyorsa kısa bekleyip yeniden dener; kilitle çalışan bir tur boş kuyruk
// bulunca biter. Turlar arası kısa bekleme diğer süreçlere kilidi alma fırsatı verir.
async function calistir() {
  const uyu = (ms: number) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 2000; i++) {
    const s = await isciTuru({ simdi: () => new Date(Number(simdiMetni)), parti: 3, saglayiciSec: () => saglayici });
    if (!s.kilitAlinamadi && s.alinan === 0) break;
    await uyu(s.kilitAlinamadi ? 3 : 5);
  }
  console.log(JSON.stringify(gonderilen));
}
void calistir();
