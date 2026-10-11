// SMTP hedefi doğrulama (SSRF koruması). Çalışma alanının girdiği SMTP sunucusu hem kaydederken hem de HER
// bağlantıdan önce DNS ile çözülür; çözülen adreslerden biri bile iç ağdaysa reddedilir. Bağlantı, doğrulanan
// IP'ye yapılır (TLS için sunucu adı ayrıca verilir): DNS yeniden bağlama (rebinding) ile doğrulamadan sonra
// iç adrese yönlendirilemez.
import "server-only";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { SMTP_IZINLI_PORTLAR } from "@/lib/mesajlasma";

// IPv4 ve IPv6 ayrı listelerde: BlockList, IPv4 adresini IPv4-eşlemeli IPv6 kurallarıyla da karşılaştırır.
const YASAK4 = new BlockList();
const YASAK6 = new BlockList();
// IPv4
for (const [ag, onek] of [
  ["0.0.0.0", 8], // "bu ağ", 0.0.0.0
  ["10.0.0.0", 8], // özel
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, bulut metadata (169.254.169.254)
  ["172.16.0.0", 12], // özel
  ["192.0.0.0", 24], // IETF protokol atamaları
  ["192.0.2.0", 24], // belgeleme
  ["192.168.0.0", 16], // özel
  ["198.18.0.0", 15], // kıyaslama
  ["198.51.100.0", 24], // belgeleme
  ["203.0.113.0", 24], // belgeleme
  ["224.0.0.0", 4], // çok noktaya yayın
  ["240.0.0.0", 4], // ayrılmış + 255.255.255.255
] as const) {
  YASAK4.addSubnet(ag, onek, "ipv4");
}
// IPv6
for (const [ag, onek] of [
  ["::", 128], // belirtilmemiş
  ["::1", 128], // loopback
  ["fc00::", 7], // benzersiz yerel (fd00:ec2::254 AWS metadata dahil)
  ["fe80::", 10], // link-local
  ["fec0::", 10], // eski site-local
  ["ff00::", 8], // çok noktaya yayın
  ["2001:db8::", 32], // belgeleme
  ["100::", 64], // atılacak
  // İçine IPv4 gömülü biçimler: gomuluIpv4() çözebildiğinde IPv4 kuralları uygulanır; çözemediği yazımlar
  // (ör. sıkıştırılmamış) burada toptan reddedilir.
  ["::", 96], // IPv4 uyumlu (eski)
  ["::ffff:0:0", 96], // IPv4 eşlemeli
  ["64:ff9b::", 96], // NAT64
] as const) {
  YASAK6.addSubnet(ag, onek, "ipv6");
}

export class SmtpHedefHatasi extends Error {
  constructor(mesaj: string) {
    super(mesaj);
    this.name = "SmtpHedefHatasi";
  }
}

/** IPv6 içine gömülü IPv4 (::ffff:a.b.c.d, ::a.b.c.d, 64:ff9b::/96 NAT64) varsa çıkarır. */
function gomuluIpv4(adres: string): string | null {
  const kucuk = adres.toLowerCase();
  const nokta = /^(?:::ffff:|::|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/.exec(kucuk);
  if (nokta) return nokta[1];
  const hex = /^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(kucuk);
  if (hex) {
    const ust = parseInt(hex[1], 16);
    const alt = parseInt(hex[2], 16);
    return `${ust >> 8}.${ust & 255}.${alt >> 8}.${alt & 255}`;
  }
  return null;
}

/** Herkese açık (iç ağ, loopback, link-local, metadata vb. olmayan) bir IP mi? */
export function genelIpMi(adres: string): boolean {
  const surum = isIP(adres);
  if (surum === 0) return false;
  if (surum === 4) return !YASAK4.check(adres, "ipv4");
  const v4 = gomuluIpv4(adres);
  if (v4) return isIP(v4) === 4 && !YASAK4.check(v4, "ipv4");
  return !YASAK6.check(adres, "ipv6");
}

export type Cozucu = (ad: string) => Promise<{ address: string; family: number }[]>;
const varsayilanCozucu: Cozucu = (ad) => lookup(ad, { all: true, verbatim: true });

export type DogrulanmisHedef = { sunucuAdi: string; ip: string; port: number };

/**
 * Sunucu adını ve portu doğrular; bağlanılacak IP'yi döndürür. Port 25, 465, 587 veya 2525 olmalı;
 * çözülen TÜM adresler herkese açık olmalı.
 */
export async function smtpHedefiDogrula(sunucu: string, port: number, coz: Cozucu = varsayilanCozucu): Promise<DogrulanmisHedef> {
  if (!(SMTP_IZINLI_PORTLAR as readonly number[]).includes(port)) {
    throw new SmtpHedefHatasi(`SMTP portu ${SMTP_IZINLI_PORTLAR.join(", ")} değerlerinden biri olmalı.`);
  }
  const ad = sunucu.trim().toLowerCase().replace(/\.$/, "").replace(/^\[(.*)\]$/, "$1");
  if (!ad || ad.length > 253) throw new SmtpHedefHatasi("Geçerli bir SMTP sunucu adı girin.");
  if (isIP(ad)) {
    if (!genelIpMi(ad)) throw new SmtpHedefHatasi("SMTP sunucusu iç ağ veya ayrılmış bir adreste olamaz.");
    return { sunucuAdi: ad, ip: ad, port };
  }
  if (!/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(ad)) {
    throw new SmtpHedefHatasi("Geçerli bir SMTP sunucu adı girin (ör. smtp.alanadiniz.com).");
  }
  let adresler: { address: string }[];
  try {
    adresler = await coz(ad);
  } catch {
    throw new SmtpHedefHatasi("SMTP sunucu adı çözülemedi.");
  }
  if (!adresler.length) throw new SmtpHedefHatasi("SMTP sunucu adı çözülemedi.");
  if (adresler.some((a) => !genelIpMi(a.address))) {
    throw new SmtpHedefHatasi("SMTP sunucusu iç ağ veya ayrılmış bir adrese çözülüyor; bu adrese bağlanılamaz.");
  }
  return { sunucuAdi: ad, ip: adresler[0].address, port };
}
