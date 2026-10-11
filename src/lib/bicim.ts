const tarihBicimi = new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul" });
const sayiBicimi = new Intl.NumberFormat("tr-TR");

export const tarihYaz = (t: Date | string | number) => tarihBicimi.format(new Date(t));
export const sayiYaz = (n: number) => sayiBicimi.format(n);
