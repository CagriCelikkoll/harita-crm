const tarihBicimi = new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul" });
const sayiBicimi = new Intl.NumberFormat("tr-TR");

export const tarihYaz = (t: Date | string | number) => tarihBicimi.format(new Date(t));
export const sayiYaz = (n: number) => sayiBicimi.format(n);

const ondalikBicimi = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 });
/** Dosya boyutu: "820 B", "12 KB", "3,4 MB", "1,2 GB". */
export function boyutYaz(bayt: number): string {
  if (bayt < 1024) return `${bayt} B`;
  if (bayt < 1024 * 1024) return `${Math.round(bayt / 1024)} KB`;
  if (bayt < 1024 ** 3) return `${ondalikBicimi.format(bayt / 1024 ** 2)} MB`;
  return `${ondalikBicimi.format(bayt / 1024 ** 3)} GB`;
}
