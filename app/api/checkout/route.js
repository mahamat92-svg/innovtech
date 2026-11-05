import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key"
);

// PRIX FIXE
const PRIX_1_MOIS = 10000;

export async function POST(req) {
    try {
        const body = await req.json();
        const { name, phone, address, items, plan } = body;

        if (!name || !phone) {
            return NextResponse.json({ error: "Champs manquants" }, { status: 400 });
        }

        // Si c'est l'abonnement 1 mois, on force le prix à 10000
        let total = PRIX_1_MOIS;

        // Si tu as d'autres plans plus tard, on les gérera ici
        if (plan === "1_mois") {
            total = 10000;
        }

        const { data, error } = await supabase
            .from("orders")
            .insert([
                {
                    customer_name: name,
                    phone: phone,
                    address: address,
                    items: items,
                    total: total,
                    status: "en_attente",
                },
            ])
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, order: data, total: total });
    } catch (e) {
        return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }
}