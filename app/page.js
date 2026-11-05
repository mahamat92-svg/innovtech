'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, supabaseConfigured } from '../lib/supabase';

const countries=['Tchad','Cameroun','Togo','Bénin','Sénégal','Niger','Mali','Gabon','Congo'];
const paymentMethods=['Espèces','MTN MoMo','Orange Money','Airtel Money','Crédit'];
const sectors=['Commerce','École','Clinique','Restaurant','Transport','Agriculture','ONG'];
const sectorTables={'École':'dossiers_ecole','Clinique':'dossiers_clinique','Restaurant':'activites_restaurant','Transport':'dossiers_transport','Agriculture':'dossiers_agriculture','ONG':'dossiers_ong'};
const profileSector=p=>p?.sector||p?.secteur||'Commerce';
const sectorInfo={
  'École':{icon:'🎓',title:'Espace éducation',records:'Élèves, classes et suivi scolaire',nav:'Élèves & suivi',modules:['Inscriptions élèves','Classes & présences','Frais scolaires','Évaluations & résultats'],kicker:'ÉDUCATION'},
  'Clinique':{icon:'🩺',title:'Espace santé',records:'Patients, rendez-vous et consultations',nav:'Patients & rendez-vous',modules:['Dossiers patients','Rendez-vous','Consultations','Facturation & suivi'],kicker:'SANTÉ'},
  'Restaurant':{icon:'🍽️',title:'Espace restauration',records:'Menu, commandes et approvisionnement',nav:'Menu & commandes',modules:['Menu & prix','Commandes','Approvisionnement','Livraisons'],kicker:'RESTAURATION'},
  'Transport':{icon:'🚚',title:'Espace transport',records:'Colis, trajets et suivi logistique',nav:'Colis & trajets',modules:['Colis & expéditions','Trajets','Véhicules & chauffeurs','Encaissements'],kicker:'TRANSPORT'},
  'Agriculture':{icon:'🌱',title:'Espace agriculture',records:'Parcelles, récoltes et intrants',nav:'Exploitations & récoltes',modules:['Parcelles & cultures','Intrants','Récoltes','Ventes agricoles'],kicker:'AGRICULTURE'},
  'ONG':{icon:'🤝',title:'Espace ONG & associations',records:'Projets, bénéficiaires et activités',nav:'Projets & bénéficiaires',modules:['Projets','Bénéficiaires','Activités terrain','Budgets & dépenses'],kicker:'ONG & ASSOCIATIONS'}
};
const cash=n=>`${new Intl.NumberFormat('fr-FR',{maximumFractionDigits:0}).format(Number(n)||0)} FCFA`;
const dateLabel=s=>s?new Date(s).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'}):'—';

export default function Home(){
  const [mode,setMode]=useState('login');
  const [session,setSession]=useState(null);
  const [profile,setProfile]=useState(null);
  const [companyPhone,setCompanyPhone]=useState('');
  const [companyCity,setCompanyCity]=useState('');
  const [page,setPage]=useState('dashboard');
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [message,setMessage]=useState('');
  const [isError,setIsError]=useState(false);
  const [products,setProducts]=useState([]);
  const [clients,setClients]=useState([]);
  const [sales,setSales]=useState([]);
  const [invoices,setInvoices]=useState([]);
  const [sectorRecords,setSectorRecords]=useState([]);
  const [merchants,setMerchants]=useState([]);
  const [subscriptions,setSubscriptions]=useState({});
  const [inspect,setInspect]=useState(null);
  const [recentInvoice,setRecentInvoice]=useState(null);
  const [invoicePreview,setInvoicePreview]=useState(null);
  const [invoiceEmail,setInvoiceEmail]=useState('');
  const [invoicePhone,setInvoicePhone]=useState('');
  const [creditPayClient,setCreditPayClient]=useState(null);
  const [filterCountry,setFilterCountry]=useState('Tous');
  const [filterSector,setFilterSector]=useState('Tous');
  const [filterPayment,setFilterPayment]=useState('Tous');
  const [filterText,setFilterText]=useState('');

  const notify=(text,error=false)=>{setMessage(text);setIsError(error);window.setTimeout(()=>setMessage(''),5000)};

  useEffect(()=>{setCompanyPhone(profile?.phone||'');setCompanyCity(profile?.city||'')},[profile?.id,profile?.phone,profile?.city]);

  const saveCompanyInfo=async e=>{
    e.preventDefault();if(!supabase||!profile)return;
    const phone=companyPhone.trim(),city=companyCity.trim();
    const {error}=await supabase.from('users').update({phone,city}).eq('id',profile.id);
    if(error)notify('Coordonnées non enregistrées : '+error.message,true);
    else{setProfile(prev=>({...prev,phone,city}));notify('Coordonnées de facture enregistrées.')}
  };

  const uploadCompanyLogo=async e=>{
    const input=e.currentTarget;const file=input.files?.[0];input.value='';if(!file||!supabase||!profile)return;
    if(!file.type.startsWith('image/')||file.size>2*1024*1024){notify('Choisissez une image de 2 Mo maximum.',true);return}
    const ext=(file.name.split('.').pop()||'png').replace(/[^a-z0-9]/gi,'').toLowerCase()||'png';
    const path=`${profile.id}/${Date.now()}.${ext}`;
    const {data,error}=await supabase.storage.from('innovtech-logos').upload(path,file,{contentType:file.type});
    if(error){notify('Logo non envoyé : '+error.message,true);return}
    const {data:{publicUrl}}=supabase.storage.from('innovtech-logos').getPublicUrl(data.path);
    const {error:profileError}=await supabase.from('users').update({logo_url:publicUrl}).eq('id',profile.id);
    if(profileError)notify('Logo envoyé, mais profil non mis à jour : '+profileError.message,true);
    else{setProfile(prev=>({...prev,logo_url:publicUrl}));notify('Logo enregistré.')}
  };

  const loadProfile=useCallback(async(user)=>{
    if(!supabase||!user)return;
    const {data,error}=await supabase.from('users').select('*').eq('id',user.id).maybeSingle();
    if(error){notify('Impossible de charger votre profil : '+error.message,true);return}
    if(!data){notify('Profil absent. Vérifiez que la migration Supabase a bien été exécutée.',true);return}
    if(data.is_blocked){await supabase.auth.signOut();setSession(null);setProfile(null);notify('Ce compte a été bloqué par l’administrateur.',true);return}
    setProfile(data);
  },[]);

  useEffect(()=>{
    let alive=true;
    if(!supabase){setLoading(false);return}
    supabase.auth.getSession().then(({data})=>{
      if(!alive)return;
      setSession(data.session);
      if(data.session?.user)loadProfile(data.session.user);else setLoading(false);
    });
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>{
      if(!alive)return;
      setSession(next);
      if(next?.user)loadProfile(next.user);else{setProfile(null);setLoading(false)}
    });
    return()=>{alive=false;subscription.unsubscribe()};
  },[loadProfile]);

  const loadMerchantData=useCallback(async()=>{
    if(!supabase||!profile||profile.role==='admin')return;
    setLoading(true);
    const sector=profileSector(profile);
    const [p,c,s,i,r]=await Promise.all([
      supabase.from('produits').select('*').order('created_at',{ascending:false}),
      supabase.from('clients').select('*').order('created_at',{ascending:false}),
      supabase.from('ventes').select('*').order('created_at',{ascending:false}).limit(100),
      supabase.from('factures').select('*').order('created_at',{ascending:false}).limit(100),
      sector==='Commerce'?Promise.resolve({data:[],error:null}):supabase.from(sectorTables[sector]||'dossiers_ecole').select('*').order('created_at',{ascending:false}).limit(200)
    ]);
    const error=[p,c,s,i,r].find(x=>x.error)?.error;
    if(error)notify('Erreur de chargement : '+error.message,true);
    setProducts(p.data||[]);setClients(c.data||[]);setSales(s.data||[]);setInvoices(i.data||[]);setSectorRecords(r.data||[]);setLoading(false);
  },[profile]);

  const loadAdminData=useCallback(async()=>{
    if(!supabase||!profile||profile.role!=='admin')return;
    setLoading(true);
    const [u,a]=await Promise.all([
      supabase.from('users').select('*').order('created_at',{ascending:false}),
      supabase.from('abonnements').select('user_id,formule,statut,montant_fcfa,periode_fin')
    ]);
    const error=[u,a].find(x=>x.error)?.error;
    if(error)notify('Erreur espace admin : '+error.message,true);
    setMerchants(u.data||[]);
    setSubscriptions(Object.fromEntries((a.data||[]).map(x=>[x.user_id,x])));
    setLoading(false);
  },[profile]);

  useEffect(()=>{if(profile?.role==='admin')loadAdminData();else if(profile)loadMerchantData()},[profile,loadAdminData,loadMerchantData]);

  const authSubmit=async e=>{
    e.preventDefault();if(!supabase)return;
    setBusy(true);setMessage(mode==='register'?'Création du compte en cours…':'Connexion en cours…');setIsError(false);const fd=new FormData(e.currentTarget);
    const email=String(fd.get('email')||'').trim();const password=String(fd.get('password')||'');
    try{
      if(mode==='register'){
        const full_name=String(fd.get('full_name')||'').trim();const shop_name=String(fd.get('shop_name')||'').trim();const country=String(fd.get('country')||'Tchad');const secteur=String(fd.get('secteur')||'Commerce');
        if(password.length<8){notify('Choisissez un mot de passe de 8 caractères minimum.',true);setBusy(false);return}
        const {data,error}=await supabase.auth.signUp({email,password,options:{data:{full_name,shop_name,country,sector:secteur,secteur}}});
        if(error)throw error;
        if(data.session){setSession(data.session);await loadProfile(data.session.user);notify('Compte créé. Bienvenue sur INNOVTECH.')}else notify('Inscription reçue. Confirmez votre adresse e-mail, puis connectez-vous.');
      }else{
        const {data,error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;
        setSession(data.session);await loadProfile(data.user);notify('Connexion réussie.');
      }
    }catch(err){notify(friendlyError(err.message),true)}finally{setBusy(false)}
  };

  const signOut=async()=>{await supabase.auth.signOut();setSession(null);setProfile(null);setProducts([]);setClients([]);setSales([]);setInvoices([]);setSectorRecords([]);setRecentInvoice(null);setInvoicePreview(null);setPage('dashboard');setMode('login')};

  const addProduct=async e=>{
    e.preventDefault();if(!supabase||!profile)return;setBusy(true);
    const form=e.currentTarget;const fd=new FormData(form);const payload={user_id:profile.id,nom:String(fd.get('nom')).trim(),categorie:String(fd.get('categorie')||'Général').trim(),prix:Number(fd.get('prix')),stock:Number(fd.get('stock'))};
    const {error}=await supabase.from('produits').insert(payload);
    if(error)notify('Produit non enregistré : '+error.message,true);else{form.reset();notify('Produit enregistré dans Supabase.');await loadMerchantData()}
    setBusy(false);
  };

  const addSectorActivity=async e=>{
    e.preventDefault();if(!supabase||!profile)return;setBusy(true);const form=e.currentTarget;const fd=new FormData(form);
    const amount=String(fd.get('montant_fcfa')||'').trim();
    const sector=profileSector(profile);const table=sectorTables[sector];
    if(!table){notify('Registre indisponible pour ce secteur.',true);setBusy(false);return}
    const payload={user_id:profile.id,module:String(fd.get('module')||''),titre:String(fd.get('titre')||'').trim(),reference:String(fd.get('reference')||'').trim(),contact:String(fd.get('contact')||'').trim(),montant_fcfa:amount?Number(amount):null,statut:String(fd.get('statut')||'En cours'),notes:String(fd.get('notes')||'').trim()};
    const {error}=await supabase.from(table).insert(payload);
    if(error)notify('Dossier non enregistré : '+error.message,true);else{form.reset();notify('Dossier enregistré dans Supabase.');await loadMerchantData()}
    setBusy(false);
  };
  const deleteSectorActivity=async id=>{
    const table=sectorTables[profileSector(profile)];if(!table){notify('Registre indisponible pour ce secteur.',true);return}
    const {error}=await supabase.from(table).delete().eq('id',id);
    if(error)notify('Suppression refusée : '+error.message,true);else{notify('Dossier supprimé.');await loadMerchantData()}
  };

  const deleteRestaurantProduct=async id=>{
    const {error}=await supabase.from('produits').delete().eq('id',id);
    if(error)notify('Plat non supprimé : '+error.message,true);else{notify('Plat supprimé du stock.');await loadMerchantData()}
  };

  const addClient=async e=>{
    e.preventDefault();if(!supabase||!profile)return;setBusy(true);const form=e.currentTarget;const fd=new FormData(form);
    const telephone=String(fd.get('telephone')||'').trim();const email=String(fd.get('email')||'').trim();
    const {error}=await supabase.from('clients').insert({user_id:profile.id,nom:String(fd.get('nom')).trim(),telephone,phone:telephone,email});
    if(error)notify('Client non enregistré : '+error.message,true);else{form.reset();notify('Client ajouté.');await loadMerchantData()}
    setBusy(false);
  };

  const addSale=async e=>{
    e.preventDefault();if(!supabase||!profile)return;setBusy(true);const form=e.currentTarget;const fd=new FormData(form);
    const productId=String(fd.get('produit_id')||'');const qty=Number(fd.get('quantite'));const payment=String(fd.get('moyen_paiement'));const clientId=String(fd.get('client_id')||'')||null;
    if(!productId||qty<=0){notify('Sélectionnez un produit et une quantité valide.',true);setBusy(false);return}
    if(payment==='Crédit'&&!clientId){notify('Une vente à crédit doit être liée à un client.',true);setBusy(false);return}
    const {data,error}=await supabase.rpc('innovtech_create_vente',{p_client_id:clientId,p_moyen_paiement:payment,p_items:[{produit_id:productId,quantite:qty}]});
    if(error)notify('Vente refusée : '+error.message,true);else{
      const product=products.find(p=>p.id===productId);
      const client=clients.find(c=>c.id===clientId);
      const fallbackLine={productName:product?.nom||'Produit',unitPrice:Number(product?.prix||0),quantity:qty,lineTotal:Number(data?.total_fcfa||0)};
      let lines=[fallbackLine];let saleDate=new Date().toISOString();let invoiceNumber=data?.facture||'';let clientName=client?.nom||'Client comptant';let invoiceId=null;let clientRowId=client?.id||null;let savedPhone=client?.phone||client?.telephone||'';let savedEmail=client?.email||'';
      const [savedLines,savedInvoice,savedSale]=await Promise.all([
        supabase.from('vente_lignes').select('produit_nom,prix_unitaire,quantite,total_ligne').eq('vente_id',data.vente_id),
        supabase.from('factures').select('id,numero_facture,client_nom,created_at,phone,email').eq('vente_id',data.vente_id).maybeSingle(),
        supabase.from('ventes').select('created_at,client_nom,client_id').eq('id',data.vente_id).maybeSingle()
      ]);
      if(savedLines.data?.length)lines=savedLines.data.map(x=>({productName:x.produit_nom,unitPrice:Number(x.prix_unitaire),quantity:Number(x.quantite),lineTotal:Number(x.total_ligne)}));
      if(savedInvoice.data){invoiceId=savedInvoice.data.id;invoiceNumber=savedInvoice.data.numero_facture;clientName=savedInvoice.data.client_nom;savedPhone=savedInvoice.data.phone||savedPhone;savedEmail=savedInvoice.data.email||savedEmail;saleDate=savedInvoice.data.created_at||saleDate}
      if(savedSale.data?.created_at)saleDate=savedSale.data.created_at;if(savedSale.data?.client_id)clientRowId=savedSale.data.client_id;
      const invoice={invoiceId,clientId:clientRowId,shopName:profile.shop_name||'INNOVTECH',invoiceNumber,clientName,total:Number(data?.total_fcfa||0),date:saleDate,lines,status:payment==='Crédit'?'Crédit':'Payée',phone:savedPhone,email:savedEmail};
      setRecentInvoice(invoice);setInvoicePreview(invoice);setInvoiceEmail(invoice.email||'');setInvoicePhone(invoice.phone||'');
      form.reset();notify(`Vente enregistrée : ${cash(data?.total_fcfa)} · facture ${invoiceNumber}`);await loadMerchantData();
    }
    setBusy(false);
  };

  const invoiceText=invoice=>[
    `INNOVTECH — FACTURE ${invoice.invoiceNumber||''}`,
    `Boutique : ${invoice.shopName||'INNOVTECH'}`,
    `Client : ${invoice.clientName||'Client comptant'}`,
    `Date : ${new Date(invoice.date||Date.now()).toLocaleString('fr-FR')}`,
    '',
    ...(invoice.lines||[]).map(line=>`${line.productName} | ${cash(line.unitPrice)} x ${line.quantity} = ${cash(line.lineTotal)}`),
    '',`TOTAL : ${cash(invoice.total)}`,'Merci pour votre achat.'
  ].join('\n');

  const openSavedInvoice=async invoice=>{
    setBusy(true);
    const [lineResult,saleResult]=await Promise.all([
      supabase.from('vente_lignes').select('produit_nom,prix_unitaire,quantite,total_ligne').eq('vente_id',invoice.vente_id),
      supabase.from('ventes').select('created_at,client_id').eq('id',invoice.vente_id).maybeSingle()
    ]);
    const lines=(lineResult.data||[]).map(x=>({productName:x.produit_nom,unitPrice:Number(x.prix_unitaire),quantity:Number(x.quantite),lineTotal:Number(x.total_ligne)}));
    const client=clients.find(c=>c.id===saleResult.data?.client_id)||clients.find(c=>c.nom===invoice.client_nom);
    const detail={invoiceId:invoice.id,clientId:saleResult.data?.client_id||null,shopName:profile.shop_name||'INNOVTECH',invoiceNumber:invoice.numero_facture,clientName:invoice.client_nom,total:Number(invoice.total_fcfa),date:saleResult.data?.created_at||invoice.created_at,lines,status:invoice.statut,phone:invoice.phone||client?.phone||client?.telephone||'',email:invoice.email||client?.email||''};
    setInvoicePreview(detail);setInvoiceEmail(detail.email||'');setInvoicePhone(detail.phone||'');setBusy(false);
    if(lineResult.error)notify('Détail de la facture incomplet : '+lineResult.error.message,true);
  };

  const persistInvoiceContact=async()=>{
    const phone=invoicePhone.trim();const email=invoiceEmail.trim();
    if(invoicePreview?.clientId){
      const {error:clientError}=await supabase.from('clients').update({phone,telephone:phone,email}).eq('id',invoicePreview.clientId).eq('user_id',profile.id);
      if(clientError){notify('Coordonnées client non enregistrées : '+clientError.message,true);return false}
    }
    const {error:invoiceError}=await supabase.from('factures').update({phone,email}).eq('id',invoicePreview.invoiceId).eq('user_id',profile.id);
    if(invoiceError){notify('Coordonnées facture non enregistrées : '+invoiceError.message,true);return false}
    setInvoicePreview(prev=>({...prev,phone,email}));
    return true;
  };

  const sendInvoiceEmail=async()=>{
    if(!invoicePreview?.invoiceId){notify('Facture non retrouvée dans Supabase.',true);return}
    if(!invoiceEmail.trim()){notify('Ajoutez l’e-mail du client à sa fiche avant l’envoi.',true);return}
    setBusy(true);
    try{
      if(!await persistInvoiceContact()){setBusy(false);return}
      const {data:{session:currentSession}}=await supabase.auth.getSession();
      const response=await fetch('/api/invoices/send',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${currentSession?.access_token||''}`},body:JSON.stringify({invoiceId:invoicePreview.invoiceId,email:invoiceEmail.trim()})});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||'L’envoi de la facture a échoué.');
      notify(result.message||'Facture envoyée par e-mail.');
    }catch(error){notify(error.message||'E-mail non envoyé.',true)}finally{setBusy(false)}
  };

  const openSaleInvoice=async sale=>{
    const {data,error}=await supabase.from('factures').select('*').eq('vente_id',sale.id).maybeSingle();
    if(error){notify('Facture non chargée : '+error.message,true);return}
    if(!data){notify('Aucune facture enregistrée pour cette vente.',true);return}
    await openSavedInvoice(data);
  };

  const invoiceWhatsAppText=invoice=>{
    const items=(invoice.lines||[]).map(line=>`${line.productName} x${line.quantity} = ${cash(line.lineTotal)}`).join(', ');
    return `Bonjour, voici votre facture N°${invoice.invoiceNumber} de ${invoice.shopName} : ${items}. Total : ${cash(invoice.total)}. Merci !`;
  };

  const sendInvoiceWhatsApp=async()=>{
    const phone=invoicePhone.replace(/\D/g,'');
    if(!phone){notify('Ajoutez le numéro WhatsApp du client à sa fiche.',true);return}
    const url=`https://wa.me/${phone}?text=${encodeURIComponent(invoiceWhatsAppText(invoicePreview))}`;
    window.open(url,'_blank','noopener,noreferrer');
    if(invoicePreview?.invoiceId)await persistInvoiceContact();
  };

  const repayCredit=async e=>{
    e.preventDefault();if(!supabase||!profile||!creditPayClient)return;setBusy(true);const form=e.currentTarget;const fd=new FormData(form);
    const amount=Number(fd.get('montant_fcfa'));const method=String(fd.get('moyen_paiement'));
    const {error}=await supabase.rpc('innovtech_rembourser_credit',{p_client_id:creditPayClient.id,p_montant:amount,p_moyen_paiement:method});
    if(error)notify('Remboursement refusé : '+error.message,true);else{notify('Remboursement enregistré et solde client mis à jour.');setCreditPayClient(null);await loadMerchantData()}
    setBusy(false);
  };

  const toggleBlocked=async merchant=>{
    const {error}=await supabase.rpc('innovtech_admin_set_block',{p_user_id:merchant.id,p_blocked:!merchant.is_blocked});
    if(error)notify('Action refusée : '+error.message,true);else{notify(merchant.is_blocked?'Compte débloqué.':'Compte bloqué.');await loadAdminData()}
  };

  const inspectMerchant=async merchant=>{
    setBusy(true);
    const [p,s,i,r]=await Promise.all([
      supabase.from('produits').select('id,nom,prix,stock').eq('user_id',merchant.id).limit(20),
      supabase.from('ventes').select('id,total_fcfa,moyen_paiement,created_at').eq('user_id',merchant.id).order('created_at',{ascending:false}).limit(10),
      supabase.from('factures').select('id,numero_facture,total_fcfa,statut').eq('user_id',merchant.id).limit(10),
      profileSector(merchant)==='Commerce'?Promise.resolve({data:[],error:null}):supabase.from(sectorTables[profileSector(merchant)]||'dossiers_ecole').select('id,module,titre,reference,contact,montant_fcfa,statut,created_at').eq('user_id',merchant.id).order('created_at',{ascending:false}).limit(20)
    ]);
    const error=[p,s,i,r].find(x=>x.error)?.error;if(error)notify('Impossible d’ouvrir ce tableau : '+error.message,true);
    setInspect({merchant,products:p.data||[],sales:s.data||[],invoices:i.data||[],records:r.data||[]});setBusy(false);
  };

  const activeSales=sales.filter(s=>new Date(s.created_at).toDateString()===new Date().toDateString());
  const todayTotal=activeSales.reduce((n,s)=>n+Number(s.total_fcfa||0),0);
  const totalStock=products.reduce((n,p)=>n+Number(p.stock||0),0);
  const totalCredit=clients.reduce((n,c)=>n+Number(c.credit_fcfa||0),0);
  const filterMerchants=useMemo(()=>merchants.filter(m=>(filterCountry==='Tous'||m.country===filterCountry)&&(filterSector==='Tous'||profileSector(m)===filterSector)&&(filterPayment==='Tous'||(filterPayment==='Bloqué'?m.is_blocked:!m.is_blocked))&&(`${m.shop_name} ${m.full_name} ${m.id}`.toLowerCase().includes(filterText.toLowerCase()))),[merchants,filterCountry,filterSector,filterPayment,filterText]);

  if(loading&&!profile&&!session)return <div className="loader"><div className="spinner"/>Chargement sécurisé…</div>;
  if(!session||!profile){
    return <main className="authwrap"><section className="authhero"><div className="authbrand"><span className="brandmark">✳</span><span>INNOVTECH<small style={{display:'block',fontSize:9,letterSpacing:'.15em',color:'#d8e4ff'}}>BUSINESS CLOUD</small></span></div><div><span className="kicker" style={{color:'#dbe8ff'}}>UNE PLATEFORME, PLUSIEURS SECTEURS</span><h1>Une solution.<br/>Votre métier.</h1><p>Commerce, écoles, cliniques, restaurants, transport, agriculture et ONG : choisissez votre secteur et retrouvez un espace de gestion adapté.</p><div className="authpoints"><span>✓ Un espace indépendant pour chaque organisation</span><span>✓ Ventes, dossiers et activités enregistrés dans Supabase</span><span>✓ Accès administrateur protégé par rôle</span></div></div><div style={{fontSize:11,color:'#d0e0ff'}}>Tchad · Cameroun · Togo · Bénin · Sénégal · Niger · Mali · Gabon · Congo</div></section><section className="authpanel"><div className="authbox"><span className="kicker">{mode==='login'?'VOTRE ESPACE':'NOUVELLE BOUTIQUE'}</span><h2>{mode==='login'?'Connexion':'Créer un compte'}</h2><p>{mode==='login'?'Connectez-vous pour retrouver l’espace de votre organisation.':'Choisissez votre secteur pour préparer votre espace de travail.'}</p>{!supabaseConfigured&&<div className="notice error">Configuration Supabase absente. Ajoutez NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY puis redémarrez le serveur.</div>}{message&&<div className={`notice ${isError?'error':'success'}`}>{message}</div>}<form className="form" onSubmit={authSubmit}>{mode==='register'&&<><div className="field"><label>Votre nom</label><input name="full_name" required autoComplete="name" placeholder="Nom complet"/></div><div className="field"><label>Nom de l’organisation / boutique</label><input name="shop_name" required placeholder="Ex. École du Centre"/></div><div className="field"><label>Secteur d’activité</label><select name="secteur">{sectors.map(x=><option key={x} value={x}>{x}</option>)}</select></div><div className="field"><label>Pays</label><select name="country">{countries.map(c=><option key={c}>{c}</option>)}</select></div></>}<div className="field"><label>Adresse e-mail</label><input name="email" type="email" required autoComplete="email" placeholder="vous@exemple.com"/></div><div className="field"><label>Mot de passe</label><input name="password" type="password" required minLength={8} autoComplete={mode==='login'?'current-password':'new-password'} placeholder="8 caractères minimum"/></div><button className="btn" disabled={busy||!supabaseConfigured}>{busy?(mode==='login'?'Connexion…':'Création…'):mode==='login'?'Se connecter':'Créer ma boutique'}</button></form><p style={{marginTop:17}}> {mode==='login'?'Pas encore de compte ?':'Vous avez déjà un compte ?'} <button className="switch" onClick={()=>{setMode(mode==='login'?'register':'login');setMessage('')}}>{mode==='login'?'S’inscrire':'Se connecter'}</button></p><p className="tiny muted">Les données de votre compte sont enregistrées via Supabase Auth et protégées par les règles de la base.</p></div></section></main>;
  }

  const isAdmin=profile.role==='admin';
  const activeSector=profileSector(profile);
  const nav=activeSector==='Commerce'
    ?[['dashboard','▦','Vue d’ensemble'],['products','▧','Produits & stock'],['sales','↗','Ventes'],['clients','♙','Clients & crédits'],['invoices','▤','Factures']]
    :activeSector==='Restaurant'
      ?[['dashboard','▦','Vue d’ensemble'],['restaurant-stock','🍽','Stock / Mes Plats'],['sector','✦','Commandes & activités'],['sales','↗','Ventes'],['invoices','▤','Factures']]
      :[['dashboard','▦','Vue d’ensemble'],['sector','✦',sectorInfo[activeSector]?.nav||'Services secteur']];
  const heading=(title,desc,buttons=null)=><div className="heading"><div><span className="kicker">{isAdmin?'ADMINISTRATION':'ESPACE ORGANISATION'}</span><h1>{title}</h1><p>{desc}</p></div>{buttons&&<div className="actions">{buttons}</div>}</div>;
  const stat=(icon,label,value,foot)=><div className="stat"><div className="stathead"><span>{label}</span><span className="staticon">{icon}</span></div><div className="statval">{value}</div><div className="statfoot">{foot}</div></div>;
  const salesTable=(rows)=> <div className="tablewrap"><table><thead><tr><th>Vente</th><th>Client</th><th>Paiement</th><th>Total</th><th>Date</th><th></th></tr></thead><tbody>{rows.length?rows.map(s=><tr key={s.id}><td>#{s.numero||String(s.id).slice(0,8)}</td><td>{s.client_nom||'Client comptant'}</td><td><span className={`tag ${s.moyen_paiement==='Crédit'?'warn':''}`}>{s.moyen_paiement}</span></td><td><b>{cash(s.total_fcfa)}</b></td><td>{dateLabel(s.created_at)}</td><td><button className="btn light small" onClick={()=>openSaleInvoice(s)}>Envoyer facture</button></td></tr>):<tr><td className="empty" colSpan="6">Aucune vente enregistrée.</td></tr>}</tbody></table></div>;

  const sectorWorkspace=()=>{
    const sector=profileSector(profile);
    const info=sectorInfo[sector]||sectorInfo['École'];
    const labels={
      'École':['Nom de l’élève / dossier','Classe / année','Parent ou responsable'],
      'Clinique':['Nom du patient / dossier','Service / référence','Téléphone du patient'],
      'Restaurant':['Plat, commande ou dossier','Catégorie / table','Client ou contact'],
      'Transport':['Colis, trajet ou dossier','Origine → destination / référence','Client ou chauffeur'],
      'Agriculture':['Parcelle, culture ou opération','Campagne / référence','Fournisseur ou responsable'],
      'ONG':['Projet, bénéficiaire ou activité','Projet / référence','Partenaire ou bénéficiaire']
    }[sector]||['Nom du dossier','Référence','Contact'];

    if(page==='sector') return <>
      {heading(info.nav,`Registre ${sector.toLowerCase()} partagé et sauvegardé dans Supabase.`)}
      <div className="grid2">
        <section className="card">
          <div className="cardhead"><h2>Ajouter · {sector}</h2></div>
          <div className="cardbody">
            <form className="form" onSubmit={addSectorActivity}>
              <div className="field"><label>Type de dossier</label><select name="module">{info.modules.map(m=><option key={m}>{m}</option>)}</select></div>
              <div className="field"><label>{labels[0]}</label><input name="titre" required maxLength="180" placeholder="Saisir le nom ou l’objet"/></div>
              <div className="fieldrow"><div className="field"><label>{labels[1]}</label><input name="reference" placeholder="Référence (facultatif)"/></div><div className="field"><label>{labels[2]}</label><input name="contact" placeholder="Téléphone ou contact"/></div></div>
              <div className="fieldrow"><div className="field"><label>Montant / budget (FCFA)</label><input name="montant_fcfa" type="number" min="0" step="1" placeholder="Facultatif"/></div><div className="field"><label>Statut</label><select name="statut"><option>En cours</option><option>À traiter</option><option>Payé</option><option>Terminé</option><option>Annulé</option></select></div></div>
              <div className="field"><label>Notes</label><input name="notes" maxLength="500" placeholder="Informations complémentaires"/></div>
              <button className="btn" disabled={busy}>Enregistrer dans Supabase</button>
            </form>
          </div>
        </section>
        <section className="card">
          <div className="cardhead"><h2>Dossiers · {sectorRecords.length}</h2></div>
          <div className="tablewrap"><table><thead><tr><th>Type</th><th>Dossier</th><th>Référence / contact</th><th>Montant</th><th>Statut</th><th></th></tr></thead>
            <tbody>{sectorRecords.length?sectorRecords.map(r=><tr key={r.id}><td>{r.module}</td><td><b>{r.titre}</b><div className="tiny muted">{dateLabel(r.created_at)}</div></td><td>{r.reference||'—'}<div className="tiny muted">{r.contact||''}</div></td><td>{r.montant_fcfa==null?'—':cash(r.montant_fcfa)}</td><td><span className={`tag ${r.statut==='À traiter'?'warn':''}`}>{r.statut}</span></td><td><button className="btn danger small" onClick={()=>deleteSectorActivity(r.id)}>Supprimer</button></td></tr>):<tr><td colSpan="6" className="empty">Aucun dossier. Ajoutez le premier à gauche.</td></tr>}</tbody>
          </table></div>
        </section>
      </div>
    </>;

    const total=sectorRecords.reduce((n,r)=>n+Number(r.montant_fcfa||0),0);
    return <>
      {heading(`${info.icon} Bonjour ${profile.full_name?.split(' ')[0]||'responsable'} 👋`,`${info.title} · ${profile.shop_name}. Vos dossiers sont stockés dans Supabase.`,<button className="btn" onClick={()=>setPage('sector')}>+ Ajouter un dossier</button>)}
      <div className="notice">Espace secteur : <b>{sector}</b>. Les enregistrements de cette organisation restent séparés selon les règles de sécurité Supabase.</div>
      <div className="stats">{stat(info.icon,'Dossiers enregistrés',sectorRecords.length,'Dans votre organisation')}{stat('⌁','À traiter',sectorRecords.filter(r=>r.statut==='À traiter').length,'Suivi opérationnel')}{stat('₣','Montants suivis',cash(total),'FCFA déclarés')}{stat('✓','Terminés',sectorRecords.filter(r=>r.statut==='Terminé'||r.statut==='Payé').length,'Dossiers clôturés')}</div>
      <div className="grid2">
        <section className="card"><div className="cardhead"><h2>Services de votre secteur</h2></div><div className="cardbody"><div className="modulegrid">{info.modules.map(m=><article className="module" key={m}><b>{info.icon} {m}</b><p>Créer et suivre des dossiers, contacts, statuts et montants en FCFA.</p></article>)}</div><button className="btn" style={{marginTop:16}} onClick={()=>setPage('sector')}>Ouvrir le registre</button></div></section>
        <section className="card"><div className="cardhead"><h2>Activité récente</h2><button className="btn light small" onClick={()=>setPage('sector')}>Voir tout</button></div><div className="tablewrap"><table><thead><tr><th>Dossier</th><th>Type</th><th>Statut</th></tr></thead><tbody>{sectorRecords.slice(0,6).map(r=><tr key={r.id}><td><b>{r.titre}</b><div className="tiny muted">{dateLabel(r.created_at)}</div></td><td>{r.module}</td><td>{r.statut}</td></tr>)}{sectorRecords.length===0&&<tr><td colSpan="3" className="empty">Vos dossiers apparaîtront ici.</td></tr>}</tbody></table></div></section>
      </div>
    </>;
  };

  const restaurantStockView=()=> <>{heading('Stock / Mes Plats','Gérez les plats, prix et quantités de votre restaurant.')}<div className="grid2"><section className="card"><div className="cardhead"><h2>Ajouter un plat</h2></div><div className="cardbody"><form className="form" onSubmit={addProduct}><div className="field"><label>Nom du plat</label><input name="nom" required maxLength="180" placeholder="Ex. Tchiep au poulet"/></div><div className="fieldrow"><div className="field"><label>Catégorie</label><input name="categorie" placeholder="Plat principal"/></div><div className="field"><label>Prix (FCFA)</label><input name="prix" type="number" min="0" step="1" required/></div></div><div className="field"><label>Quantité disponible</label><input name="stock" type="number" min="0" step="0.001" defaultValue="0" required/></div><button className="btn" disabled={busy}>Enregistrer le plat</button></form></div></section><section className="card"><div className="cardhead"><h2>Mes plats · {products.length}</h2></div><div className="tablewrap"><table><thead><tr><th>Plat</th><th>Catégorie</th><th>Prix</th><th>Disponible</th><th></th></tr></thead><tbody>{products.length?products.map(p=><tr key={p.id}><td><b>{p.nom}</b></td><td>{p.categorie}</td><td>{cash(p.prix)}</td><td>{p.stock}</td><td><button className="btn danger small" onClick={()=>deleteRestaurantProduct(p.id)}>Supprimer</button></td></tr>):<tr><td colSpan="5" className="empty">Ajoutez votre premier plat à la carte.</td></tr>}</tbody></table></div></section></div></>;

  const merchantView=()=>{
    const active=profileSector(profile);
    if(active==='Restaurant'&&page==='restaurant-stock')return restaurantStockView();
    if(active!=='Commerce'&&!(active==='Restaurant'&&['sales','invoices'].includes(page)))return sectorWorkspace();
    if(page==='products')return <>{heading('Produits & stock','Vos produits enregistrés dans Supabase.')}<div className="grid2"><section className="card"><div className="cardhead"><h2>Ajouter un produit</h2></div><div className="cardbody"><form className="form" onSubmit={addProduct}><div className="field"><label>Nom du produit</label><input name="nom" required maxLength="180" placeholder="Ex. Riz parfumé 25 kg"/></div><div className="fieldrow"><div className="field"><label>Catégorie</label><input name="categorie" placeholder="Alimentation"/></div><div className="field"><label>Prix (FCFA)</label><input name="prix" type="number" min="0" step="1" required/></div></div><div className="field"><label>Quantité en stock</label><input name="stock" type="number" min="0" step="0.001" defaultValue="0" required/></div><button className="btn" disabled={busy}>Enregistrer dans Supabase</button></form></div></section><section className="card"><div className="cardhead"><h2>Catalogue · {products.length}</h2></div><div className="tablewrap"><table><thead><tr><th>Produit</th><th>Prix</th><th>Stock</th></tr></thead><tbody>{products.length?products.map(p=><tr key={p.id}><td><b>{p.nom}</b><div className="tiny muted">{p.categorie}</div></td><td>{cash(p.prix)}</td><td><span className={`tag ${Number(p.stock)<5?'warn':''}`}>{p.stock}</span></td></tr>):<tr><td colSpan="3" className="empty">Ajoutez votre premier produit.</td></tr>}</tbody></table></div></section></div></>;
    if(page==='sales')return <>{heading('Ventes','Chaque vente est enregistrée côté serveur et met à jour le stock.',<button className="btn" onClick={()=>setPage('dashboard')}>+ Nouvelle vente</button>)}<section className="card"><div className="cardhead"><h2>Historique des ventes</h2><span className="muted tiny">{sales.length} lignes</span></div>{salesTable(sales)}</section></>;
    if(page==='clients')return <>{heading('Clients & crédits','Carnet clients, dettes et remboursements enregistrés dans Supabase.')}{creditPayClient&&<section className="card"><div className="cardhead"><h2>Remboursement · {creditPayClient.nom} · solde {cash(creditPayClient.credit_fcfa)}</h2><button className="btn light small" onClick={()=>setCreditPayClient(null)}>Annuler</button></div><div className="cardbody"><form className="form" onSubmit={repayCredit}><div className="fieldrow"><div className="field"><label>Montant reçu (FCFA)</label><input name="montant_fcfa" type="number" min="1" max={creditPayClient.credit_fcfa} step="1" defaultValue={creditPayClient.credit_fcfa} required/></div><div className="field"><label>Mode reçu</label><select name="moyen_paiement"><option>Espèces</option><option>MTN MoMo</option><option>Orange Money</option><option>Airtel Money</option></select></div></div><button className="btn" disabled={busy}>Enregistrer le remboursement</button></form></div></section>}<div className="grid2"><section className="card"><div className="cardhead"><h2>Ajouter un client</h2></div><div className="cardbody"><form className="form" onSubmit={addClient}><div className="field"><label>Nom du client</label><input name="nom" required placeholder="Nom ou commerce"/></div><div className="field"><label>Téléphone / WhatsApp</label><input name="telephone" type="tel" placeholder="Numéro avec indicatif pays"/></div><div className="field"><label>E-mail</label><input name="email" type="email" placeholder="client@exemple.com"/></div><button className="btn" disabled={busy}>Enregistrer le client</button></form></div></section><section className="card"><div className="cardhead"><h2>Clients · {clients.length}</h2></div><div className="tablewrap"><table><thead><tr><th>Client</th><th>WhatsApp / téléphone</th><th>E-mail</th><th>Dette</th><th>Action</th></tr></thead><tbody>{clients.length?clients.map(c=><tr key={c.id}><td><b>{c.nom}</b></td><td>{c.phone||c.telephone||'—'}</td><td>{c.email||'—'}</td><td>{cash(c.credit_fcfa)}</td><td>{Number(c.credit_fcfa)>0?<button className="btn light small" onClick={()=>setCreditPayClient(c)}>Rembourser</button>:'—'}</td></tr>):<tr><td colSpan="5" className="empty">Aucun client pour le moment.</td></tr>}</tbody></table></div></section></div></>;
    if(page==='invoices')return <>{heading('Factures','Factures générées automatiquement à chaque vente.')}<section className="card"><div className="cardhead"><h2>Factures · {invoices.length}</h2></div><div className="tablewrap"><table><thead><tr><th>Numéro</th><th>Client</th><th>Montant</th><th>Statut</th><th>Date</th><th></th></tr></thead><tbody>{invoices.length?invoices.map(i=><tr key={i.id}><td><b>{i.numero_facture}</b></td><td>{i.client_nom}</td><td>{cash(i.total_fcfa)}</td><td><span className={`tag ${i.statut==='Crédit'?'warn':''}`}>{i.statut}</span></td><td>{dateLabel(i.created_at)}</td><td><button className="btn light small" onClick={()=>openSavedInvoice(i)}>Envoyer facture</button></td></tr>):<tr><td colSpan="6" className="empty">Les factures apparaîtront ici après une vente.</td></tr>}</tbody></table></div></section></>;
    return <>{heading(`Bonjour ${profile.full_name?.split(' ')[0]||'commerçant'} 👋`,'Voici les chiffres de votre boutique synchronisés avec Supabase.',<button className="btn" onClick={()=>document.getElementById('quick-sale')?.scrollIntoView({behavior:'smooth'})}>+ Nouvelle vente</button>)}<div className="notice">🔐 Bienvenue sur mon SaaS INNOVTECH à votre service · Vos données sont séparées de celles des autres commerçants par les règles RLS.</div><div className="stats">{stat('↗','Ventes du jour',cash(todayTotal),`${activeSales.length} transaction(s)`)}{stat('▧','Articles en stock',totalStock,`${products.length} produits`)}{stat('♙','Crédit à recevoir',cash(totalCredit),`${clients.filter(c=>Number(c.credit_fcfa)>0).length} client(s)`)}{stat('▤','Factures',invoices.length,'Générées par les ventes')}</div><div className="grid2"><section className="card" id="quick-sale"><div className="cardhead"><h2>Nouvelle vente</h2><span className="tiny muted">Stock vérifié côté base</span></div><div className="cardbody"><form className="form" onSubmit={addSale}><div className="field"><label>Produit</label><select name="produit_id" required defaultValue=""><option value="" disabled>Choisir un produit</option>{products.map(p=><option key={p.id} value={p.id}>{p.nom} · {cash(p.prix)} · stock {p.stock}</option>)}</select></div><div className="fieldrow"><div className="field"><label>Quantité</label><input name="quantite" type="number" min="0.001" step="0.001" defaultValue="1" required/></div><div className="field"><label>Mode de paiement</label><select name="moyen_paiement">{paymentMethods.map(p=><option key={p}>{p}</option>)}</select></div></div><div className="field"><label>Client (requis pour le crédit)</label><select name="client_id" defaultValue=""><option value="">Client comptant</option>{clients.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}</select></div><button className="btn" disabled={busy||products.length===0}>{busy?'Enregistrement…':'Valider la vente · FCFA'}</button></form></div></section><section className="card"><div className="cardhead"><h2>Ventes récentes</h2><button className="btn light small" onClick={()=>setPage('sales')}>Tout voir</button></div>{salesTable(sales.slice(0,5))}</section></div><div className="modulegrid">{[['📦','Stock synchronisé','Ajoutez vos articles et vérifiez les quantités avant chaque vente.'],['🧾','Facturation automatique','Chaque vente crée une facture dans la base.'],['🔐','Accès isolé','Un commerçant ne peut lire que ses propres lignes.'],['📲','Paiement Mobile Money','Modes enregistrables; le transfert réel opérateur reste à connecter.']].map(x=><article className="module" key={x[1]}><b>{x[0]} {x[1]}</b><p>{x[2]}</p></article>)}</div></>;
  };

  const adminView=()=>{
    const paid=Object.values(subscriptions).filter(x=>x.statut==='actif');
    const monthly=paid.reduce((n,x)=>n+Number(x.montant_fcfa||0),0);
    return <>{heading('Administration multi-sectorielle','Organisations inscrites dans Supabase, tous secteurs confondus.')}<div className="notice">Accès administrateur contrôlé par le rôle en base. N’accordez jamais ce rôle depuis l’inscription publique.</div><div className="stats">{stat('♙','Organisations',merchants.filter(m=>m.role==='merchant').length,'Tous secteurs confondus')}{stat('✓','Abonnements actifs',paid.length,'Statut enregistré')}{stat('₣','Abonnement actif déclaré',cash(monthly),'Pas un encaissement confirmé')}{stat('●','Comptes bloqués',merchants.filter(m=>m.is_blocked).length,'Accès révoqué par RLS')}</div><section className="card"><div className="cardhead"><div><h2>Organisations</h2><span className="tiny muted">{filterMerchants.length} résultat(s)</span></div><div className="actions"><select className="btn light small" value={filterCountry} onChange={e=>setFilterCountry(e.target.value)}><option>Tous</option>{countries.map(c=><option key={c}>{c}</option>)}</select><select className="btn light small" value={filterSector} onChange={e=>setFilterSector(e.target.value)}><option value="Tous">Tous secteurs</option>{sectors.map(c=><option key={c} value={c}>{c}</option>)}</select><select className="btn light small" value={filterPayment} onChange={e=>setFilterPayment(e.target.value)}><option>Tous</option><option>Bloqué</option><option>Actif</option></select><input style={{maxWidth:180,padding:'8px 10px',border:'1px solid #dce4ef',borderRadius:9}} value={filterText} onChange={e=>setFilterText(e.target.value)} placeholder="Rechercher…"/></div></div><div className="tablewrap"><table><thead><tr><th>Organisation / responsable</th><th>Secteur</th><th>Pays</th><th>Abonnement</th><th>État</th><th>Inscription</th><th>Actions</th></tr></thead><tbody>{filterMerchants.filter(m=>m.role==='merchant').map(m=>{const sub=subscriptions[m.id];return <tr key={m.id}><td><b>{m.shop_name}</b><div className="tiny muted">{m.full_name||'—'} · {m.email||''}</div></td><td>{profileSector(m)}</td><td>{m.country}</td><td>{sub?.formule||'Découverte'} · {sub?.statut||'essai'}</td><td><span className={`tag ${m.is_blocked?'bad':''}`}>{m.is_blocked?'Bloqué':'Actif'}</span></td><td>{dateLabel(m.created_at)}</td><td><div className="actions"><button className="btn light small" onClick={()=>inspectMerchant(m)}>Voir</button><button className={`btn small ${m.is_blocked?'':'danger'}`} onClick={()=>toggleBlocked(m)}>{m.is_blocked?'Débloquer':'Bloquer'}</button></div></td></tr>})}{filterMerchants.filter(m=>m.role==='merchant').length===0&&<tr><td colSpan="7" className="empty">Aucune organisation ne correspond au filtre.</td></tr>}</tbody></table></div></section>{inspect&&<section className="card"><div className="cardhead"><div><h2>{inspect.merchant.shop_name} — aperçu</h2><span className="tiny muted">Tableau de bord consulté par l’administrateur</span></div><button className="btn light small" onClick={()=>setInspect(null)}>Fermer</button></div><div className="stats" style={{padding:15,margin:0}}><div className="stat"><div className="stathead">{profileSector(inspect.merchant)==='Commerce'?'Produits':'Dossiers sectoriels'}</div><div className="statval">{profileSector(inspect.merchant)==='Commerce'?inspect.products.length:inspect.records.length}</div></div><div className="stat"><div className="stathead">Ventes récentes</div><div className="statval">{inspect.sales.length}</div></div><div className="stat"><div className="stathead">Factures</div><div className="statval">{inspect.invoices.length}</div></div><div className="stat"><div className="stathead">Montant ventes listées</div><div className="statval" style={{fontSize:16}}>{cash(inspect.sales.reduce((n,x)=>n+Number(x.total_fcfa||0),0))}</div></div></div><div className="tablewrap">{profileSector(inspect.merchant)==='Commerce'?<table><thead><tr><th>Produit</th><th>Prix</th><th>Stock</th></tr></thead><tbody>{inspect.products.map(p=><tr key={p.id}><td>{p.nom}</td><td>{cash(p.prix)}</td><td>{p.stock}</td></tr>)}</tbody></table>:<table><thead><tr><th>Dossier</th><th>Module</th><th>Contact</th><th>Montant</th><th>Statut</th></tr></thead><tbody>{inspect.records.map(r=><tr key={r.id}><td><b>{r.titre}</b><div className="tiny muted">{r.reference}</div></td><td>{r.module}</td><td>{r.contact||'—'}</td><td>{r.montant_fcfa==null?'—':cash(r.montant_fcfa)}</td><td>{r.statut}</td></tr>)}{inspect.records.length===0&&<tr><td colSpan="5" className="empty">Aucun dossier sectoriel enregistré.</td></tr>}</tbody></table>}</div></section>}</>;
  };

  return <div className="shell"><header className="top"><div className="brand"><span className="brandmark">✳</span><span>INNOVTECH<small>BUSINESS CLOUD</small></span></div><div className="usernav"><details className="business-branding"><summary className="btn light small">Identité facture</summary><div className="business-branding-panel"><form onSubmit={saveCompanyInfo}><label>Téléphone de l’entreprise</label><input type="tel" value={companyPhone} onChange={e=>setCompanyPhone(e.target.value)} placeholder="+235…"/><label>Ville</label><input value={companyCity} onChange={e=>setCompanyCity(e.target.value)} placeholder="Ville"/><button className="btn small">Enregistrer</button></form><label className="btn light small logo-upload">Ajouter le logo de mon entreprise / école / commerce / société<input type="file" accept="image/*" onChange={uploadCompanyLogo} hidden/></label></div></details><span className="username">{profile.shop_name} · {profile.country}</span><span className="avatar">{(profile.full_name||'I').slice(0,1).toUpperCase()}</span><button className="btn light small" onClick={signOut}>Déconnexion</button></div></header><div className="layout"><aside className="sidebar"><div className="sidecap">{isAdmin?'Administration':(sectorInfo[activeSector]?.title||'Ma boutique')}</div>{(isAdmin?[['admin','▦','Vue admin']]:nav).map(x=><button key={x[0]} className={`side ${page===x[0]?'active':''}`} onClick={()=>{setPage(x[0]);setInspect(null)}}><span className="sideicon">{x[1]}</span>{x[2]}</button>)}{isAdmin&&<div className="sidefoot notice tiny">Compte propriétaire confirmé par la base Supabase.</div>}</aside><main className="main">{message&&<div className={`notice ${isError?'error':'success'}`}>{message}</div>}{recentInvoice&&!isAdmin&&<div className="notice success recent-invoice-action"><span>Vente enregistrée · Facture {recentInvoice.invoiceNumber}</span><button className="btn small" onClick={()=>{setInvoicePreview(recentInvoice);setInvoiceEmail(recentInvoice.email||'');setInvoicePhone(recentInvoice.phone||'')}}>Voir la facture</button></div>}{loading?<div className="loader"><div className="spinner"/>Synchronisation Supabase…</div>:isAdmin?adminView():merchantView()}</main></div>{invoicePreview&&<div className="invoice-overlay" role="dialog" aria-modal="true" aria-label="Facture INNOVTECH"><div className="invoice-dialog"><div className="invoice-tools no-print"><h2>Facture · {invoicePreview.invoiceNumber}</h2><button className="btn light small" onClick={()=>setInvoicePreview(null)}>Fermer</button></div><article className="invoice-print-root"><header className="invoice-brand invoice-company-head">{profile.logo_url?<img className="invoice-logo-image" src={profile.logo_url} alt="Logo de l’entreprise"/>:<div className="invoice-logo">✳</div>}<div className="invoice-company-meta"><strong>{profile.shop_name||'INNOVTECH'}</strong><span>{profile.phone||'Téléphone à renseigner'}</span><span>{profile.city||profile.country||'Ville à renseigner'}</span></div><div className="invoice-company-date"><b>Date</b><br/>{new Date(invoicePreview.date||Date.now()).toLocaleString('fr-FR')}</div></header><div className="invoice-title"><div><h1>FACTURE</h1><span>{invoicePreview.invoiceNumber||'Nouvelle facture'}</span></div></div><div className="invoice-parties"><div><small>BOUTIQUE</small><b>{invoicePreview.shopName||'INNOVTECH'}</b><span>Facture émise par INNOVTECH</span></div><div><small>CLIENT</small><b>{invoicePreview.clientName||'Client comptant'}</b><span>{invoicePreview.status||'Payée'}</span></div></div><div className="invoice-lines"><table><thead><tr><th>Produit</th><th>Prix</th><th>Qté</th><th>Total</th></tr></thead><tbody>{(invoicePreview.lines||[]).map((line,i)=><tr key={`${line.productName}-${i}`}><td>{line.productName}</td><td>{cash(line.unitPrice)}</td><td>{line.quantity}</td><td>{cash(line.lineTotal)}</td></tr>)}</tbody></table></div><div className="invoice-total"><span>TOTAL À PAYER</span><strong>{cash(invoicePreview.total)}</strong></div><p className="invoice-thanks">Merci pour votre achat.</p></article><div className="invoice-share no-print"><div className="field"><label>E-mail du client</label><input type="email" value={invoiceEmail} onChange={e=>setInvoiceEmail(e.target.value)} placeholder="client@exemple.com"/></div><button className="btn" disabled={busy} onClick={sendInvoiceEmail}>{busy?'Envoi…':'Envoyer par Email'}</button><div className="field"><label>WhatsApp du client (indicatif pays inclus)</label><input type="tel" value={invoicePhone} onChange={e=>setInvoicePhone(e.target.value)} placeholder="Ex. +237 6 00 00 00 00"/></div><div className="actions"><button className="btn" onClick={()=>window.print()}>Imprimer la facture</button><button className="btn" style={{background:'#16865b'}} onClick={sendInvoiceWhatsApp}>Envoyer sur WhatsApp</button></div><p className="tiny muted">L’e-mail est envoyé avec le PDF en pièce jointe lorsque SMTP est configuré. WhatsApp s’ouvre avec le numéro et le message prérempli; il reste à confirmer l’envoi.</p></div></div></div>}</div>;
}

function friendlyError(message=''){
  if(/Invalid login credentials/i.test(message))return 'E-mail ou mot de passe incorrect.';
  if(/Email not confirmed/i.test(message))return 'Confirmez votre adresse e-mail avant de vous connecter.';
  if(/already registered/i.test(message))return 'Cette adresse e-mail possède déjà un compte.';
  if(/Failed to fetch/i.test(message))return 'Impossible de joindre Supabase. Vérifiez l’URL et la connexion réseau.';
  if(/AbortError|aborted|timed out/i.test(message))return 'La demande a expiré : Supabase ne répond pas. Vérifiez la connexion réseau et réessayez.';
  return message;
}
