import "server-only";
import { NextResponse } from "next/server";

export const yetkisiz = () => NextResponse.json({ hata: "Oturum gerekli." }, { status: 401 });
export const bulunamadi = () => NextResponse.json({ hata: "Bulunamadı." }, { status: 404 });
export const gecersiz = (hata: string) => NextResponse.json({ hata }, { status: 400 });
