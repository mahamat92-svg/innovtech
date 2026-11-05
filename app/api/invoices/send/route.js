import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import PDFDocument from 'pdfkit';

export const runtime = 'nodejs';

const money = value => `${new Intl.NumberFormat('fr-FR',{maximumFractionDigits:0}).format(Number(value)||0)} FCFA`;
const emailIsValid = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value||''));

function createInvoicePdf({invoice,lines,shopName}){
  return new Promise((resolve,reject)=>{
    const doc=new PDFDocument({size:'A4',margin:48});
    const chunks=[];
    doc.on('data',chunk=>chunks.push(chunk));
    doc.on('error',reject);
    doc.on('end',()=>resolve(Buffer.concat(chunks)));
    doc.fontSize(20).fillColor('#1747b8').text('INNOVTECH');
    doc.fontSize(9).fillColor('#64748b').text('BUSINESS CLOUD');
    doc.moveDown(1.5);
    doc.fontSize(18).fillColor('#17243b').text('FACTURE');
    doc.fontSize(10).text(`N° ${invoice.numero_facture}`);
    doc.text(`Date : ${new Date(invoice.created_at).toLocaleString('fr-FR')}`);
    doc.moveDown();
    doc.fontSize(11).text(`Boutique : ${shopName||'INNOVTECH'}`);
    doc.text(`Client : ${invoice.client_nom||'Client comptant'}`);
    doc.text(`Statut : ${invoice.statut||'Payée'}`);
    doc.moveDown();
    doc.fontSize(10).fillColor('#17243b').text('DÉTAILS', {underline:true});
    doc.moveDown(.4);
    for(const line of lines){
      const label=`${line.produit_nom}  |  ${money(line.prix_unitaire)} x ${line.quantite}  |  ${money(line.total_ligne)}`;
      doc.fontSize(10).text(label,{continued:false});
    }
    doc.moveDown();
    doc.fontSize(14).fillColor('#1747b8').text(`TOTAL : ${money(invoice.total_fcfa)}`);
    doc.moveDown(1.5);
    doc.fontSize(11).fillColor('#17243b').text('Merci pour votre achat.',{align:'center'});
    doc.end();
  });
}

export async function POST(request){
  try{
    const bearer=request.headers.get('authorization')||'';
    const token=bearer.startsWith('Bearer ')?bearer.slice(7):'';
    if(!token)return Response.json({error:'Connexion requise.'},{status:401});

    const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if(!url||!key)return Response.json({error:'Configuration Supabase absente.'},{status:503});
    const db=createClient(url,key,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    const {data:auth,error:authError}=await db.auth.getUser(token);
    if(authError||!auth?.user)return Response.json({error:'Session invalide; reconnectez-vous.'},{status:401});

    const body=await request.json().catch(()=>({}));
    const invoiceId=String(body.invoiceId||'');
    const emailOverride=String(body.email||'').trim();
    if(!invoiceId)return Response.json({error:'Facture introuvable.'},{status:400});

    const {data:invoice,error:invoiceError}=await db.from('factures').select('id,user_id,vente_id,numero_facture,client_nom,total_fcfa,statut,created_at,email,phone').eq('id',invoiceId).eq('user_id',auth.user.id).maybeSingle();
    if(invoiceError||!invoice)return Response.json({error:'Facture introuvable ou accès refusé.'},{status:404});
    const recipient=invoice.email||emailOverride;
    if(!emailIsValid(recipient))return Response.json({error:'Ajoutez une adresse e-mail valide au client avant l’envoi.'},{status:400});

    const smtpHost=process.env.SMTP_HOST;
    const smtpPort=Number(process.env.SMTP_PORT||587);
    const smtpUser=process.env.SMTP_USER;
    const smtpPass=process.env.SMTP_PASS;
    const smtpFrom=process.env.SMTP_FROM;
    if(!smtpHost||!smtpUser||!smtpPass||!smtpFrom){
      return Response.json({error:'L’envoi automatique n’est pas configuré. Ajoutez SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS et SMTP_FROM côté serveur.'},{status:503});
    }

    const [{data:lines,error:linesError},{data:profile}]=await Promise.all([
      db.from('vente_lignes').select('produit_nom,prix_unitaire,quantite,total_ligne').eq('vente_id',invoice.vente_id).eq('user_id',auth.user.id).order('id'),
      db.from('users').select('shop_name').eq('id',auth.user.id).maybeSingle()
    ]);
    if(linesError)return Response.json({error:'Impossible de charger les articles de la facture.'},{status:500});
    const shopName=profile?.shop_name||'INNOVTECH';
    const pdf=await createInvoicePdf({invoice,lines:lines||[],shopName});
    const text=[
      `Bonjour, veuillez trouver en pièce jointe la facture N°${invoice.numero_facture} de ${shopName}.`,
      '',...(lines||[]).map(line=>`${line.produit_nom} x${line.quantite} = ${money(line.total_ligne)}`),
      '',`Total : ${money(invoice.total_fcfa)}`,'Merci pour votre achat.'
    ].join('\n');
    const transport=nodemailer.createTransport({host:smtpHost,port:smtpPort,secure:process.env.SMTP_SECURE==='true'||smtpPort===465,auth:{user:smtpUser,pass:smtpPass}});
    await transport.sendMail({
      from:smtpFrom,
      to:recipient,
      subject:`Facture ${invoice.numero_facture} — ${shopName}`,
      text,
      attachments:[{filename:`facture-${String(invoice.numero_facture).replace(/[^a-zA-Z0-9_-]/g,'_')}.pdf`,content:pdf,contentType:'application/pdf'}]
    });
    return Response.json({ok:true,message:`Facture envoyée à ${recipient}.`});
  }catch(error){
    console.error('Invoice email error:',error?.message||error);
    return Response.json({error:'Échec de l’envoi de l’e-mail. Vérifiez la configuration SMTP et réessayez.'},{status:500});
  }
}
