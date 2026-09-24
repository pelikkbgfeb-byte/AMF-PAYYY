const KASERA_API_KEY = 'kp_live_oW_ObOY3XcJrtHS_MIStR-dJZ_aKzlVw2LC5yIO25dY';
const KASERA_URL = 'https://pay.kasera.id/v1/transactions';

// Fungsi untuk menghitung CRC16 CCITT (False) standar EMVCo
function calculateCRC16(data) {
    let crc = 0xFFFF;
    for (let i = 0; i < data.length; i++) {
        crc ^= data.charCodeAt(i) << 8;
        for (let j = 0; j < 8; j++) {
            if ((crc & 0x8000) !== 0) {
                crc = (crc << 1) ^ 0x1021;
            } else {
                crc = crc << 1;
            }
        }
    }
    let hex = (crc & 0xFFFF).toString(16).toUpperCase();
    while (hex.length < 4) {
        hex = '0' + hex;
    }
    return hex;
}

// Fungsi untuk memodifikasi Tag 59 (Nama Merchant) dan Tag 60 (Kota) pada QRIS EMVCo
function modifyQrisMerchantName(qrisStr, newName, newCity) {
    // Bersihkan CRC lama (4 karakter terakhir) dan tambahkan placeholder CRC baru "6304"
    let cleanQris = qrisStr.trim();
    if (cleanQris.endsWith('6304')) {
        // Jika string sudah pas di tag CRC
    } else {
        // Potong 4 karakter terakhir untuk membuang CRC lama Kasera
        cleanQris = cleanQris.slice(0, -4);
    }

    // Format Tag 59 (Merchant Name) max 25 karakter atau sesuai standar
    const nameVal = newName.substring(0, 25);
    const nameLen = nameVal.length < 10 ? '0' + nameVal.length : '' + nameVal.length;
    const tag59New = '59' + nameLen + nameVal;

    // Format Tag 60 (Merchant City) max 15 karakter
    const cityVal = newCity.substring(0, 15);
    const cityLen = cityVal.length < 10 ? '0' + cityVal.length : '' + cityVal.length;
    const tag60New = '60' + cityLen + cityVal;

    // Cari posisi Tag 59 dan Tag 60 dalam string QRIS
    let idx59 = cleanQris.indexOf('59');
    let idx60 = cleanQris.indexOf('60');

    if (idx59 !== -1 && idx60 !== -1) {
        // Ambil bagian sebelum tag 59
        let prefix = cleanQris.substring(0, idx59);
        
        // Cari akhir dari tag 60 (panjang tag 60 biasanya 2 digit setelah '60', lalu nilai datanya)
        // Cara aman: cari tag berikutnya setelah tag 60 (biasanya tag '61' atau '62' atau '52')
        let tag61OrAfter = -1;
        ['61', '62', '52', '99'].forEach(t => {
            let pos = cleanQris.indexOf(t, idx60 + 2);
            if (pos !== -1 && (tag61OrAfter === -1 || pos < tag61OrAfter)) {
                tag61OrAfter = pos;
            }
        });

        let suffix = '';
        if (tag61OrAfter !== -1) {
            suffix = cleanQris.substring(tag61OrAfter);
        }

        // Gabungkan kembali dengan data baru
        let assembled = prefix + tag59New + tag60New + suffix + '6304';
        
        // Hitung CRC16 baru dari string yang dirakit
        let crcVal = calculateCRC16(assembled);
        return assembled + crcVal;
    }

    // Fallback jika parsing gagal, kembalikan qris asli
    return qrisStr;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: "Method not allowed" });
    }

    try {
        const { amount } = req.body;
        const uniqueId = 'AMF-' + Date.now();

        const kaseraResponse = await fetch(KASERA_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${KASERA_API_KEY}`,
                'Idempotency-Key': uniqueId,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                amount: parseInt(amount) || 10000,
                external_id: uniqueId,
                description: "Top-Up Saldo AMF PAY",
                payment_methods: ["qris"]
            })
        });

        const trxData = await kaseraResponse.json();

        if (!kaseraResponse.ok) {
            const errDetail = trxData.message || JSON.stringify(trxData);
            return res.status(kaseraResponse.status).json({
                success: false,
                message: `Kasera Error: ${errDetail}`,
                error: trxData
            });
        }

        let rawQrString = trxData.payment?.qr_string;

        if (!rawQrString) {
            return res.status(500).json({ 
                success: false, 
                message: "QR String tidak ditemukan dari response Kasera Pay." 
            });
        }

        // Modifikasi string QRIS agar nama merchant berubah jadi PT ANUGRAH MITRA FINANSIAL
        rawQrString = modifyQrisMerchantName(rawQrString, "PT ANUGRAH MITRA FINANSIAL", "JAKARTA SELATAN");

        return res.status(200).json({
            success: true,
            message: "QRIS Berhasil Dibuat",
            data: {
                invoiceId: trxData.id,
                externalId: trxData.external_id,
                amount: trxData.amount,
                fee: trxData.fee,
                net: trxData.net,
                checkoutUrl: trxData.checkout_url,
                qrString: rawQrString,
                instructions: trxData.instructions,
                expiresAt: trxData.expires_at
            }
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Terjadi kesalahan internal pada server backend",
            error: error.message
        });
    }
}
