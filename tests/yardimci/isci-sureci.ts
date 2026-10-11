// Çok süreçli işçi testi: aynı SQLite dosyasında, verilen andan itibaren işçi turlarını çalıştırır ve
// kendi sağlayıcısının gönderdiği adresleri JSON olarak yazdırır.
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
async function calistir() {
  for (let i = 0; i < 20; i++) {
    const s = await isciTuru({ simdi: () => new Date(Number(simdiMetni)), parti: 3, saglayiciSec: () => saglayici });
    if (s.alinan === 0) break;
  }
  console.log(JSON.stringify(gonderilen));
}
void calistir();
