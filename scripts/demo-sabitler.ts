// Demo ortamının yan etkisiz sabitleri (demo-ortam.ts ortam değişkenlerini değiştirir; testler bunu içe aktarır).

/**
 * Demo taramasında (Kadıköy, emlak ofisi, 1,5 km; deterministik) sahte Places istemcisinin bilerek SABİT HAT
 * ("0 (212) 000 …", gerçek abone olamaz) döndüreceği iki Google kaydı: SMS kampanyasında "cep telefonu değil"
 * nedeniyle düşme demoda görülebilsin. İkisi de "demo" etiketli ve kayıtta telefonu yok (numara Places'tan gelir).
 */
export const DEMO_SABIT_HATLAR = ["mock_real_estate_agency_10247_7254", "mock_real_estate_agency_10247_7256"];
