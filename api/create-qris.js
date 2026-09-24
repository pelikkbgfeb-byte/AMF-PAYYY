const KASERA_API_KEY = 'kp_live_oW_ObOY3XcJrtHS_MIStR-dJZ_aKzlVw2LC5yIO25dY';
const KASERA_URL = 'https://pay.kasera.id/v1/transactions';

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

        const rawQrString = trxData.payment?.qr_string;

        if (!rawQrString) {
            return res.status(500).json({ 
                success: false, 
                message: "QR String tidak ditemukan dari response Kasera Pay." 
            });
        }

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
