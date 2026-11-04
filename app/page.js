'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, supabaseConfigured } from '../lib/supabase';

const countries=['Tchad','Cameroun','Togo','Bénin','Sénégal','Niger','Mali','Gabon','Congo'];
const paymentMethods=['Espèces','MTN MoMo','Orange Money','Airtel Money','Crédit'];
const cash=n=>`${new Intl.NumberFormat('fr-FR',{maximumFractionDigits:0}).format(Number(n)||0)} FCFA`;
const dateLabel=s=>s?new Date(s).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'}):'—';

export default function Home(){
  const [mode,setMode]=useState('login');
  const [session,setSession]=useState(null);
  const [profile,setProfile]=useState(null);
  const [page,setPage]=useState('dashboard');
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [message,setMessage]=useState('');
  const [isError,setIsError]=useState(false);
  const [products,setProducts]=useState([]);
  const [clients,setClients]=useState([]);
  const [sales,setSales]=useState([]);
  const [invoices,setInvoices]=useState([]);
  const [merchants,setMerchants]=useState([]);
  const [subscriptions,setSubscriptions]=useState({});
  const [inspect,setInspect]=useState(null);
  const [creditPayClient,setCreditPayClient]=useState(null);
  const [filterCountry,setFilterCountry]=useState('Tous');
  const [filterPayment,setFilterPayment]=useState('Tous');
  const [filterText,setFilterText]=useState('');

  const notify=(text,error=false)=>{setMessage(text);setIsError(error);window.setTimeout(()=>setMessage(''),5000)};

  const loadProfile=useCallback(async(user)=>{
    if(!supabase||!user)return;
    const {data,error}=await supabase.from('users').select('id,full_name,email,shop_name,country,role,is_blocked,created_at').eq('id',user.id).maybeSingle();
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
    const [p,c,s,i]=await Promise.all([
      supabase.from('produits').select('*').order('created_at',{ascending:false}),
      supabase.from('clients').select('*').order('created_at',{ascending:false}),
      supabase.from('ventes').select('*').order('created_at',{ascending:false}).limit(100),
      supabase.from('factures').select('*').order('created_at',{ascending:false}).limit(100)
    ]);
    const error=[p,c,s,i].find(x=>x.error)?.error;
    if(error)notify('Erreur de chargement : '+error.message,true);
    setProducts(p.data||[]);setClients(c.data||[]);setSales(s.data||[]);setInvoices(i.data||[]);setLoading(false);
  },[profile]);

  const loadAdminData=useCallback(async()=>{
    if(!supabase||!profile||profile.role!=='admin')return;
    setLoading(true);
    const [u,a]=await Promise.all([
      supabase.from('users').select('id,full_name,email,shop_name,country,role,is_blocked,created_at').order('created_at',{ascending:false}),
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
        const full_name=String(fd.get('full_name')||'').trim();const shop_name=String(fd.get('shop_name')||'').trim();const country=String(fd.get('country')||'Tchad');
        if(password.length<8){notify('Choisissez un mot de passe de 8 caractères minimum.',true);setBusy(false);return}
        const {data,error}=await supabase.auth.signUp({email,password,options:{data:{full_name,shop_name,country}}});
        if(error)throw error;
        if(data.session){setSession(data.session);await loadProfile(data.session.user);notify('Compte créé. Bienvenue sur INNOVTECH.')}else notify('Inscription reçue. Confirmez votre adresse e-mail, puis connectez-vous.');
      }else{
        const {data,error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;
        setSession(data.session);await loadProfile(data.user);notify('Connexion réussie.');
      }
    }catch(err){notify(friendlyError(err.message),true)}finally{setBusy(false)}
  };

  const signOut=async()=>{await supabase.auth.signOut();setSession(null);setProfile(null);setProducts([]);setClients([]);setSales([]);setInvoices([]);setPage('dashboard');setMode('login')};

  const addProduct=async e=>{
    e.preventDefault();if(!supabase||!profile)return;setBusy(true);
    const form=e.currentTarget;const fd=new FormData(form);const payload={user_id:profile.id,nom:String(fd.get('nom')).trim(),categorie:String(fd.get('categorie')||'Général').trim(),prix:Number(fd.get('prix')),stock:Number(fd.get('stock'))};
    const {error}=await supabase.from('produits').insert(payload);
    if(error)notify('Produit non enregistré : '+error.message,true);else{form.reset();notify('Produit enregistré dans Supabase.');await loadMerchantData()}
    setBusy(false);
  };

  const addClient=async e=>{
    e.preventDefault();if(!supabase||!profile)return;setBusy(true);const form=e.currentTarget;const fd=new FormData(form);
    const {error}=await supabase.from('clients').insert({user_id:profile.id,nom:String(fd.get('nom')).trim(),telephone:String(fd.get('telephone')||'').trim()});
    if(error)notify('Client non enregistré : '+error.message,true);else{form.reset();notify('Client ajouté.');await loadMerchantData()}
    setBusy(false);
  };

  const addSale=async e=>{
    e.preventDefault();if(!supabase||!profile)return;setBusy(true);const form=e.currentTarget;const fd=new FormData(form);
    const productId=String(fd.get('produit_id')||'');const qty=Number(fd.get('quantite'));const payment=String(fd.get('moyen_paiement'));const clientId=String(fd.get('client_id')||'')||null;
    if(!productId||qty<=0){notify('Sélectionnez un produit et une quantité valide.',true);setBusy(false);return}
    if(payment==='Crédit'&&!clientId){notify('Une vente à crédit doit être liée à un client.',true);setBusy(false);return}
    const {data,error}=await supabase.rpc('innovtech_create_vente',{p_client_id:clientId,p_moyen_paiement:payment,p_items:[{produit_id:productId,quantite:qty}]});
    if(error)notify('Vente refusée : '+error.message,true);else{form.reset();notify(`Vente enregistrée : ${cash(data?.total_fcfa)} · facture ${data?.facture||''}`);await loadMerchantData()}
    setBusy(false);
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
    const [p,s,i]=await Promise.all([
      supabase.from('produits').select('id,nom,prix,stock').eq('user_id',merchant.id).limit(20),
      supabase.from('ventes').select('id,total_fcfa,moyen_paiement,created_at').eq('user_id',merchant.id).order('created_at',{ascending:false}).limit(10),
      supabase.from('factures').select('id,numero_facture,total_fcfa,statut').eq('user_id',merchant.id).limit(10)
    ]);
    const error=[p,s,i].find(x=>x.error)?.error;if(error)notify('Impossible d’ouvrir ce tableau : '+error.message,true);
    setInspect({merchant,products:p.data||[],sales:s.data||[],invoices:i.data||[]});setBusy(false);
  };

  const activeSales=sales.filter(s=>new Date(s.created_at).toDateString()===new Date().toDateString());
  const todayTotal=activeSales.reduce((n,s)=>n+Number(s.total_fcfa||0),0);
  const totalStock=products.reduce((n,p)=>n+Number(p.stock||0),0);
  const totalCredit=clients.reduce((n,c)=>n+Number(c.credit_fcfa||0),0);
  const filterMerchants=useMemo(()=>merchants.filter(m=>(filterCountry==='Tous'||m.country===filterCountry)&&(filterPayment==='Tous'||(filterPayment==='Bloqué'?m.is_blocked:!m.is_blocked))&&(`${m.shop_name} ${m.full_name} ${m.id}`.toLowerCase().includes(filterText.toLowerCase()))),[merchants,filterCountry,filterPayment,filterText]);

  if(loading&&!profile&&!session)return <div className="loader"><div className="spinner"/>Chargement sécurisé…</div>;
  if(!session||!profile){
    return <main className="authwrap"><section className="authhero"><div className="authbrand"><span className="brandmark">✳</span><span>INNOVTECH<small style={{display:'block',fontSize:9,letterSpacing:'.15em',color:'#d8e4ff'}}>BUSINESS CLOUD</small></span></div><div><span className="kicker" style={{color:'#dbe8ff'}}>LE COMMERCE AFRICAIN, SIMPLEMENT</span><h1>Votre boutique.<br/>Mieux organisée.</h1><p>Ventes, stock, factures et clients en FCFA — au même endroit, avec vos données enregistrées dans votre espace Supabase.</p><div className="authpoints"><span>✓ Tableau de bord commerçant privé</span><span>✓ Ventes et stock enregistrés dans la base</span><span>✓ Interface d’administration protégée par rôle</span></div></div><div style={{fontSize:11,color:'#d0e0ff'}}>Tchad · Cameroun · Togo · Bénin · Sénégal · Niger · Mali · Gabon · Congo</div></section><section className="authpanel"><div className="authbox"><span className="kicker">{mode==='login'?'VOTRE ESPACE':'NOUVELLE BOUTIQUE'}</span><h2>{mode==='login'?'Connexion':'Créer un compte'}</h2><p>{mode==='login'?'Connectez-vous pour retrouver les données de votre boutique.':'Inscrivez votre commerce pour commencer à gérer vos ventes.'}</p>{!supabaseConfigured&&<div className="notice error">Configuration Supabase absente. Ajoutez NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY puis redémarrez le serveur.</div>}{message&&<div className={`notice ${isError?'error':'success'}`}>{message}</div>}<form className="form" onSubmit={authSubmit}>{mode==='register'&&<><div className="field"><label>Votre nom</label><input name="full_name" required autoComplete="name" placeholder="Nom complet"/></div><div className="field"><label>Nom de la boutique</label><input name="shop_name" required placeholder="Ex. Boutique du Centre"/></div><div className="field"><label>Pays</label><select name="country">{countries.map(c=><option key={c}>{c}</option>)}</select></div></>}<div className="field"><label>Adresse e-mail</label><input name="email" type="email" required autoComplete="email" placeholder="vous@exemple.com"/></div><div className="field"><label>Mot de passe</label><input name="password" type="password" required minLength={8} autoComplete={mode==='login'?'current-password':'new-password'} placeholder="8 caractères minimum"/></div><button className="btn" disabled={busy||!supabaseConfigured}>{busy?(mode==='login'?'Connexion…':'Création…'):mode==='login'?'Se connecter':'Créer ma boutique'}</button></form><p style={{marginTop:17}}> {mode==='login'?'Pas encore de compte ?':'Vous avez déjà un compte ?'} <button className="switch" onClick={()=>{setMode(mode==='login'?'register':'login');setMessage('')}}>{mode==='login'?'S’inscrire':'Se connecter'}</button></p><p className="tiny muted">Les données de votre compte sont enregistrées via Supabase Auth et protégées par les règles de la base.</p></div></section></main>;
  }

  const isAdmin=profile.role==='admin';
  const nav=[['dashboard','▦','Vue d’ensemble'],['products','▧','Produits & stock'],['sales','↗','Ventes'],['clients','♙','Clients & crédits'],['invoices','▤','Factures']];
  const heading=(title,desc,buttons=null)=><div className="heading"><div><span className="kicker">{isAdmin?'ADMINISTRATION':'ESPACE COMMERÇANT'}</span><h1>{title}</h1><p>{desc}</p></div>{buttons&&<div className="actions">{buttons}</div>}</div>;
  const stat=(icon,label,value,foot)=><div className="stat"><div className="stathead"><span>{label}</span><span className="staticon">{icon}</span></div><div className="statval">{value}</div><div className="statfoot">{foot}</div></div>;
  const salesTable=(rows)=> <div className="tablewrap"><table><thead><tr><th>Vente</th><th>Client</th><th>Paiement</th><th>Total</th><th>Date</th></tr></thead><tbody>{rows.length?rows.map(s=><tr key={s.id}><td>#{s.numero||String(s.id).slice(0,8)}</td><td>{s.client_nom||'Client comptant'}</td><td><span className={`tag ${s.moyen_paiement==='Crédit'?'warn':''}`}>{s.moyen_paiement}</span></td><td><b>{cash(s.total_fcfa)}</b></td><td>{dateLabel(s.created_at)}</td></tr>):<tr><td className="empty" colSpan="5">Aucune vente enregistrée.</td></tr>}</tbody></table></div>;

  const merchantView=()=>{
    if(page==='products')return <>{heading('Produits & stock','Vos produits enregistrés dans Supabase.')}<div className="grid2"><section className="card"><div className="cardhead"><h2>Ajouter un produit</h2></div><div className="cardbody"><form className="form" onSubmit={addProduct}><div className="field"><label>Nom du produit</label><input name="nom" required maxLength="180" placeholder="Ex. Riz parfumé 25 kg"/></div><div className="fieldrow"><div className="field"><label>Catégorie</label><input name="categorie" placeholder="Alimentation"/></div><div className="field"><label>Prix (FCFA)</label><input name="prix" type="number" min="0" step="1" required/></div></div><div className="field"><label>Quantité en stock</label><input name="stock" type="number" min="0" step="0.001" defaultValue="0" required/></div><button className="btn" disabled={busy}>Enregistrer dans Supabase</button></form></div></section><section className="card"><div className="cardhead"><h2>Catalogue · {products.length}</h2></div><div className="tablewrap"><table><thead><tr><th>Produit</th><th>Prix</th><th>Stock</th></tr></thead><tbody>{products.length?products.map(p=><tr key={p.id}><td><b>{p.nom}</b><div className="tiny muted">{p.categorie}</div></td><td>{cash(p.prix)}</td><td><span className={`tag ${Number(p.stock)<5?'warn':''}`}>{p.stock}</span></td></tr>):<tr><td colSpan="3" className="empty">Ajoutez votre premier produit.</td></tr>}</tbody></table></div></section></div></>;
    if(page==='sales')return <>{heading('Ventes','Chaque vente est enregistrée côté serveur et met à jour le stock.',<button className="btn" onClick={()=>setPage('dashboard')}>+ Nouvelle vente</button>)}<section className="card"><div className="cardhead"><h2>Historique des ventes</h2><span className="muted tiny">{sales.length} lignes</span></div>{salesTable(sales)}</section></>;
    if(page==='clients')return <>{heading('Clients & crédits','Carnet clients, dettes et remboursements enregistrés dans Supabase.')}{creditPayClient&&<section className="card"><div className="cardhead"><h2>Remboursement · {creditPayClient.nom} · solde {cash(creditPayClient.credit_fcfa)}</h2><button className="btn light small" onClick={()=>setCreditPayClient(null)}>Annuler</button></div><div className="cardbody"><form className="form" onSubmit={repayCredit}><div className="fieldrow"><div className="field"><label>Montant reçu (FCFA)</label><input name="montant_fcfa" type="number" min="1" max={creditPayClient.credit_fcfa} step="1" defaultValue={creditPayClient.credit_fcfa} required/></div><div className="field"><label>Mode reçu</label><select name="moyen_paiement"><option>Espèces</option><option>MTN MoMo</option><option>Orange Money</option><option>Airtel Money</option></select></div></div><button className="btn" disabled={busy}>Enregistrer le remboursement</button></form></div></section>}<div className="grid2"><section className="card"><div className="cardhead"><h2>Ajouter un client</h2></div><div className="cardbody"><form className="form" onSubmit={addClient}><div className="field"><label>Nom du client</label><input name="nom" required placeholder="Nom ou commerce"/></div><div className="field"><label>Téléphone</label><input name="telephone" placeholder="Numéro avec indicatif pays"/></div><button className="btn" disabled={busy}>Enregistrer le client</button></form></div></section><section className="card"><div className="cardhead"><h2>Clients · {clients.length}</h2></div><div className="tablewrap"><table><thead><tr><th>Client</th><th>Téléphone</th><th>Dette</th><th>Action</th></tr></thead><tbody>{clients.length?clients.map(c=><tr key={c.id}><td><b>{c.nom}</b></td><td>{c.telephone||'—'}</td><td>{cash(c.credit_fcfa)}</td><td>{Number(c.credit_fcfa)>0?<button className="btn light small" onClick={()=>setCreditPayClient(c)}>Rembourser</button>:'—'}</td></tr>):<tr><td colSpan="4" className="empty">Aucun client pour le moment.</td></tr>}</tbody></table></div></section></div></>;
    if(page==='invoices')return <>{heading('Factures','Factures générées automatiquement à chaque vente.')}<section className="card"><div className="cardhead"><h2>Factures · {invoices.length}</h2></div><div className="tablewrap"><table><thead><tr><th>Numéro</th><th>Client</th><th>Montant</th><th>Statut</th><th>Date</th></tr></thead><tbody>{invoices.length?invoices.map(i=><tr key={i.id}><td><b>{i.numero_facture}</b></td><td>{i.client_nom}</td><td>{cash(i.total_fcfa)}</td><td><span className={`tag ${i.statut==='Crédit'?'warn':''}`}>{i.statut}</span></td><td>{dateLabel(i.created_at)}</td></tr>):<tr><td colSpan="5" className="empty">Les factures apparaîtront ici après une vente.</td></tr>}</tbody></table></div></section></>;
    return <>{heading(`Bonjour ${profile.full_name?.split(' ')[0]||'commerçant'} 👋`,'Voici les chiffres de votre boutique synchronisés avec Supabase.',<button className="btn" onClick={()=>document.getElementById('quick-sale')?.scrollIntoView({behavior:'smooth'})}>+ Nouvelle vente</button>)}<div className="notice">🔐 Connecté à Supabase · Vos données sont séparées de celles des autres commerçants par les règles RLS.</div><div className="stats">{stat('↗','Ventes du jour',cash(todayTotal),`${activeSales.length} transaction(s)`)}{stat('▧','Articles en stock',totalStock,`${products.length} produits`)}{stat('♙','Crédit à recevoir',cash(totalCredit),`${clients.filter(c=>Number(c.credit_fcfa)>0).length} client(s)`)}{stat('▤','Factures',invoices.length,'Générées par les ventes')}</div><div className="grid2"><section className="card" id="quick-sale"><div className="cardhead"><h2>Nouvelle vente</h2><span className="tiny muted">Stock vérifié côté base</span></div><div className="cardbody"><form className="form" onSubmit={addSale}><div className="field"><label>Produit</label><select name="produit_id" required defaultValue=""><option value="" disabled>Choisir un produit</option>{products.map(p=><option key={p.id} value={p.id}>{p.nom} · {cash(p.prix)} · stock {p.stock}</option>)}</select></div><div className="fieldrow"><div className="field"><label>Quantité</label><input name="quantite" type="number" min="0.001" step="0.001" defaultValue="1" required/></div><div className="field"><label>Mode de paiement</label><select name="moyen_paiement">{paymentMethods.map(p=><option key={p}>{p}</option>)}</select></div></div><div className="field"><label>Client (requis pour le crédit)</label><select name="client_id" defaultValue=""><option value="">Client comptant</option>{clients.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}</select></div><button className="btn" disabled={busy||products.length===0}>{busy?'Enregistrement…':'Valider la vente · FCFA'}</button></form></div></section><section className="card"><div className="cardhead"><h2>Ventes récentes</h2><button className="btn light small" onClick={()=>setPage('sales')}>Tout voir</button></div>{salesTable(sales.slice(0,5))}</section></div><div className="modulegrid">{[['📦','Stock synchronisé','Ajoutez vos articles et vérifiez les quantités avant chaque vente.'],['🧾','Facturation automatique','Chaque vente crée une facture dans la base.'],['🔐','Accès isolé','Un commerçant ne peut lire que ses propres lignes.'],['📲','Paiement Mobile Money','Modes enregistrables; le transfert réel opérateur reste à connecter.']].map(x=><article className="module" key={x[1]}><b>{x[0]} {x[1]}</b><p>{x[2]}</p></article>)}</div></>;
  };

  const adminView=()=>{
    const paid=Object.values(subscriptions).filter(x=>x.statut==='actif');
    const monthly=paid.reduce((n,x)=>n+Number(x.montant_fcfa||0),0);
    return <>{heading('Administration','Comptes réellement inscrits dans Supabase.')}<div className="notice">Accès administrateur contrôlé par le rôle en base. N’accordez jamais ce rôle depuis l’inscription publique.</div><div className="stats">{stat('♙','Commerçants',merchants.filter(m=>m.role==='merchant').length,'Profils Supabase')}{stat('✓','Abonnements actifs',paid.length,'Statut enregistré')}{stat('₣','Abonnement actif déclaré',cash(monthly),'Pas un encaissement confirmé')}{stat('●','Comptes bloqués',merchants.filter(m=>m.is_blocked).length,'Accès révoqué par RLS')}</div><section className="card"><div className="cardhead"><div><h2>Commerçants</h2><span className="tiny muted">{filterMerchants.length} résultat(s)</span></div><div className="actions"><select className="btn light small" value={filterCountry} onChange={e=>setFilterCountry(e.target.value)}><option>Tous</option>{countries.map(c=><option key={c}>{c}</option>)}</select><select className="btn light small" value={filterPayment} onChange={e=>setFilterPayment(e.target.value)}><option>Tous</option><option>Bloqué</option><option>Actif</option></select><input style={{maxWidth:180,padding:'8px 10px',border:'1px solid #dce4ef',borderRadius:9}} value={filterText} onChange={e=>setFilterText(e.target.value)} placeholder="Rechercher…"/></div></div><div className="tablewrap"><table><thead><tr><th>Boutique / propriétaire</th><th>Pays</th><th>Abonnement</th><th>État</th><th>Inscription</th><th>Actions</th></tr></thead><tbody>{filterMerchants.filter(m=>m.role==='merchant').map(m=>{const sub=subscriptions[m.id];return <tr key={m.id}><td><b>{m.shop_name}</b><div className="tiny muted">{m.full_name||'—'} · {m.email||''}</div></td><td>{m.country}</td><td>{sub?.formule||'Découverte'} · {sub?.statut||'essai'}</td><td><span className={`tag ${m.is_blocked?'bad':''}`}>{m.is_blocked?'Bloqué':'Actif'}</span></td><td>{dateLabel(m.created_at)}</td><td><div className="actions"><button className="btn light small" onClick={()=>inspectMerchant(m)}>Voir</button><button className={`btn small ${m.is_blocked?'':'danger'}`} onClick={()=>toggleBlocked(m)}>{m.is_blocked?'Débloquer':'Bloquer'}</button></div></td></tr>})}{filterMerchants.filter(m=>m.role==='merchant').length===0&&<tr><td colSpan="6" className="empty">Aucun commerçant ne correspond au filtre.</td></tr>}</tbody></table></div></section>{inspect&&<section className="card"><div className="cardhead"><div><h2>{inspect.merchant.shop_name} — aperçu</h2><span className="tiny muted">Tableau de bord consulté par l’administrateur</span></div><button className="btn light small" onClick={()=>setInspect(null)}>Fermer</button></div><div className="stats" style={{padding:15,margin:0}}><div className="stat"><div className="stathead">Produits</div><div className="statval">{inspect.products.length}</div></div><div className="stat"><div className="stathead">Ventes récentes</div><div className="statval">{inspect.sales.length}</div></div><div className="stat"><div className="stathead">Factures</div><div className="statval">{inspect.invoices.length}</div></div><div className="stat"><div className="stathead">Montant ventes listées</div><div className="statval" style={{fontSize:16}}>{cash(inspect.sales.reduce((n,x)=>n+Number(x.total_fcfa||0),0))}</div></div></div><div className="tablewrap"><table><thead><tr><th>Produit</th><th>Prix</th><th>Stock</th></tr></thead><tbody>{inspect.products.map(p=><tr key={p.id}><td>{p.nom}</td><td>{cash(p.prix)}</td><td>{p.stock}</td></tr>)}</tbody></table></div></section>}</>;
  };

  return <div className="shell"><header className="top"><div className="brand"><span className="brandmark">✳</span><span>INNOVTECH<small>BUSINESS CLOUD</small></span></div><div className="usernav"><span className="username">{profile.shop_name} · {profile.country}</span><span className="avatar">{(profile.full_name||'I').slice(0,1).toUpperCase()}</span><button className="btn light small" onClick={signOut}>Déconnexion</button></div></header><div className="layout"><aside className="sidebar"><div className="sidecap">{isAdmin?'Administration':'Ma boutique'}</div>{(isAdmin?[['admin','▦','Vue admin']]:nav).map(x=><button key={x[0]} className={`side ${page===x[0]?'active':''}`} onClick={()=>{setPage(x[0]);setInspect(null)}}><span className="sideicon">{x[1]}</span>{x[2]}</button>)}{isAdmin&&<div className="sidefoot notice tiny">Compte propriétaire confirmé par la base Supabase.</div>}</aside><main className="main">{message&&<div className={`notice ${isError?'error':'success'}`}>{message}</div>}{loading?<div className="loader"><div className="spinner"/>Synchronisation Supabase…</div>:isAdmin?adminView():merchantView()}</main></div></div>;
}

function friendlyError(message=''){
  if(/Invalid login credentials/i.test(message))return 'E-mail ou mot de passe incorrect.';
  if(/Email not confirmed/i.test(message))return 'Confirmez votre adresse e-mail avant de vous connecter.';
  if(/already registered/i.test(message))return 'Cette adresse e-mail possède déjà un compte.';
  if(/Failed to fetch/i.test(message))return 'Impossible de joindre Supabase. Vérifiez l’URL et la connexion réseau.';
  if(/AbortError|aborted|timed out/i.test(message))return 'La demande a expiré : Supabase ne répond pas. Vérifiez la connexion réseau et réessayez.';
  return message;
}
