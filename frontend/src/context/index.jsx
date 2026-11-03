import React, {
  createContext, useContext, useState, useEffect,
  useCallback, useMemo, useRef,
} from 'react';
import { api, setToken, clearLocalData, pingServer } from '../api/client.js';
import { EXTRA } from './extra-i18n.js';

// ══════════════════════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════════════════════
const AuthCtx = createContext(null);
export function AuthProvider({ children }) {
  const [user,     setUser]     = useState(null);
  const [business, setBusiness] = useState(null);
  const [branches, setBranches] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [activeBranch, setActiveBranch] = useState(null);
  const [bootError, setBootError] = useState(null);   // server unreachable while restoring a session

  const applyMe = d => { setUser(d.user); setBusiness(d.business); setBranches(d.branches || []); setActiveBranch(a => a || d.branches?.[0]?.id || null); };

  const boot = useCallback(() => {
    setBootError(null);
    let token = null; try { token = localStorage.getItem('pt-token'); } catch {}
    if (!token) { setLoading(false); pingServer(); return; }
    setLoading(true);
    api.get('/auth/me')
      .then(applyMe)
      .catch(e => {
        // Only a rejected token logs the user out. Network/server trouble keeps the session
        // and shows a retry screen instead of silently dumping them on the login page.
        if (e.status === 401) { setToken(null); clearLocalData(); }
        else setBootError(e.message);
      })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { boot(); }, [boot]);

  const reset = useCallback(() => { setUser(null); setBusiness(null); setBranches([]); setActiveBranch(null); }, []);
  useEffect(() => { window.addEventListener('pt-logout', reset); return () => window.removeEventListener('pt-logout', reset); }, [reset]);

  const afterAuth = useCallback(async d => {
    clearLocalData();
    setToken(d.token);
    setUser(d.user); setBusiness(d.business);
    try { applyMe(await api.get('/auth/me')); } catch { /* the dashboard will retry */ }
    return d;
  }, []);

  const login = useCallback(async (email, password) =>
    afterAuth(await api.post('/auth/login', { email: email.trim().toLowerCase(), password }, { retry: true })), [afterAuth]);

  const register = useCallback(async (payload) =>
    afterAuth(await api.post('/auth/register', { ...payload, email: payload.email.trim().toLowerCase(), ownerName: payload.ownerName.trim(), businessName: payload.businessName.trim() })), [afterAuth]);

  const logout = useCallback(() => { setToken(null); clearLocalData(); reset(); }, [reset]);

  const updateSettings = useCallback(async (payload) => {
    const d = await api.patch('/auth/me/settings', payload);
    setUser(d.user); return d.user;
  }, []);

  const refreshBusiness = useCallback(async () => {
    const d = await api.get('/auth/me');
    setUser(d.user); setBusiness(d.business); setBranches(d.branches||[]);
  }, []);

  const value = useMemo(() => ({
    user, business, branches, loading, bootError, retryBoot: boot, isAuthenticated: !!user,
    activeBranch, setActiveBranch,
    login, register, logout, updateSettings, refreshBusiness, setBusiness,
  }), [user, business, branches, loading, bootError, boot, activeBranch, login, register, logout, updateSettings, refreshBusiness]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => { const c = useContext(AuthCtx); if (!c) throw new Error('useAuth outside AuthProvider'); return c; };

// ══════════════════════════════════════════════════════════════════════════════
// THEME
// ══════════════════════════════════════════════════════════════════════════════
const ThemeCtx = createContext(null);
function resolveMode(m) {
  if (m === 'dark')  return true;
  if (m === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}
export function ThemeProvider({ children, initMode }) {
  const [mode, _setMode] = useState(initMode || localStorage.getItem('pt-theme') || 'system');
  useEffect(() => { if (initMode && initMode !== mode) _setMode(initMode); }, [initMode]);

  const setMode = useCallback((m) => {
    _setMode(m);
    localStorage.setItem('pt-theme', m);
    document.documentElement.setAttribute('data-theme', resolveMode(m) ? 'dark' : 'light');
  }, []);

  useEffect(() => {
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const fn = () => document.documentElement.setAttribute('data-theme', mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, [mode]);

  const val = useMemo(() => ({ mode, setMode, isDark: resolveMode(mode) }), [mode, setMode]);
  return <ThemeCtx.Provider value={val}>{children}</ThemeCtx.Provider>;
}
export const useTheme = () => useContext(ThemeCtx);

// ══════════════════════════════════════════════════════════════════════════════
// TOAST
// ══════════════════════════════════════════════════════════════════════════════
const ToastCtx = createContext(null);
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((msg, type = 'success') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`} role="alert">{t.msg}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ══════════════════════════════════════════════════════════════════════════════
// ONLINE STATUS
// ══════════════════════════════════════════════════════════════════════════════
const OnlineCtx = createContext(true);
export function OnlineProvider({ children }) {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on  = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online',  on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return <OnlineCtx.Provider value={online}>{children}</OnlineCtx.Provider>;
}
export const useOnline = () => useContext(OnlineCtx);

// ══════════════════════════════════════════════════════════════════════════════
// i18n — 6 languages
// ══════════════════════════════════════════════════════════════════════════════
export const LANGUAGES = [
  { code: 'en',  label: 'English',         flag: '🇬🇧' },
  { code: 'pcm', label: 'Pidgin',          flag: '🇳🇬' },
  { code: 'yo',  label: 'Yorùbá',          flag: '🇳🇬' },
  { code: 'ha',  label: 'Hausa',           flag: '🇳🇬' },
  { code: 'ig',  label: 'Igbo',            flag: '🇳🇬' },
  { code: 'fr',  label: 'Français',        flag: '🇫🇷' },
];

const T = {
  en: {
    // Nav
    nav_dashboard:'Dashboard', nav_pos:'Point of Sale', nav_sales:'Sales',
    nav_inventory:'Inventory', nav_customers:'Customers', nav_expenses:'Expenses',
    nav_invoices:'Invoices', nav_analysis:'Business Analysis',
    nav_alerts:'Alerts', nav_reports:'Reports',
    nav_billing:'Billing & Plan', nav_settings:'Settings', nav_team:'Team',
    nav_logout:'Log out',
    // Auth
    login_title:'Welcome back', login_sub:'Sign in to manage your business.',
    login_email:'Email address', login_password:'Password', login_btn:'Sign in',
    login_no_acc:"Don't have an account?", login_create:'Create one',
    login_demo:'Demo: demo@pulsetrack.app / demo1234',
    reg_title:'Set up your business', reg_sub:'Less than a minute — no card needed.',
    reg_biz:'Business name', reg_industry:'Industry (optional)',
    reg_name:'Your full name', reg_btn:'Create my business',
    reg_have:'Already have an account?', reg_signin:'Sign in',
    // Dashboard
    dash_greet:'Here\'s how your business is doing',
    dash_rev_today:'Today\'s Revenue', dash_rev_7:'7-Day Revenue',
    dash_gross_profit:'30-Day Gross Profit', dash_net_profit:'30-Day Net Profit',
    dash_low_stock:'Low Stock Items', dash_trend:'Revenue — Last 14 Days',
    dash_top:'Best Sellers (7 days)', dash_branch:'Branch Performance',
    // POS
    pos_title:'Point of Sale', pos_search:'Search product or scan barcode…',
    pos_cart:'Cart', pos_customer:'Customer (optional)', pos_walkin:'Walk-in customer',
    pos_payment:'How did the customer pay?', pos_discount:'Discount (₦)',
    pos_tendered:'Amount tendered (₦)', pos_complete:'Complete Sale',
    pos_change:'Change due', pos_empty_cart:'Cart is empty',
    pos_quick:'Quick Products',
    // Products
    inv_title:'Inventory', inv_new:'Add Product', inv_export:'Export CSV',
    inv_import:'Import CSV', inv_adjust:'Adjust Stock', inv_history:'Stock History',
    inv_name:'Product name', inv_sku:'SKU', inv_barcode:'Barcode',
    inv_category:'Category', inv_cost:'Cost price (₦)', inv_price:'Selling price (₦)',
    inv_qty:'Opening quantity', inv_reorder:'Reorder level', inv_unit:'Unit',
    inv_service:'Service item (no stock tracking)',
    inv_save:'Save product', inv_low_badge:'Low stock',
    inv_empty:'No products yet. Add your first product to start selling.',
    // Customers
    cust_title:'Customers', cust_new:'Add Customer', cust_name:'Full name',
    cust_phone:'Phone number', cust_email:'Email (optional)', cust_address:'Address',
    cust_type:'Customer type', cust_notes:'Notes', cust_spent:'Total spent',
    cust_last:'Last purchase', cust_at_risk:'At risk', cust_active:'Active',
    cust_save:'Save customer', cust_empty:'No customers yet.',
    // Expenses
    exp_title:'Expenses', exp_new:'Add Expense', exp_category:'Category',
    exp_desc:'Description', exp_amount:'Amount (₦)', exp_date:'Date',
    exp_method:'Payment method', exp_save:'Save expense', exp_empty:'No expenses yet.',
    // Invoices
    inv2_title:'Invoices', inv2_new:'Create Invoice', inv2_num:'Invoice number',
    inv2_customer:'Customer', inv2_due:'Amount due (₦)', inv2_paid:'Amount paid (₦)',
    inv2_date:'Due date', inv2_notes:'Notes', inv2_save:'Save invoice',
    inv2_pay:'Record payment', inv2_empty:'No invoices yet.',
    status_paid:'Paid', status_unpaid:'Unpaid', status_partial:'Partially paid', status_overdue:'Overdue',
    // Analysis
    analysis_title:'Business Analysis', analysis_sub:'Insights generated from your actual business data.',
    analysis_best:'Best Sellers', analysis_slow:'Slow Movers',
    analysis_low_stock:'Needs Restocking', analysis_top_cust:'Top Customers',
    analysis_inactive:'Inactive Customers (30+ days)',
    // Alerts
    alerts_title:'Alerts', alerts_mark_all:'Mark all read', alerts_empty:'All caught up — no new alerts.',
    // Reports
    reports_title:'Reports', reports_sales:'Sales Report',
    reports_pl:'Profit & Loss', reports_expenses:'Expense Breakdown',
    reports_from:'From', reports_to:'To',
    // Billing
    billing_title:'Billing & Plan', billing_usage:'Current usage',
    billing_monthly:'Monthly', billing_annual:'Annual (2 months free)',
    billing_upgrade:'Upgrade', billing_cancel:'Cancel subscription',
    billing_history:'Payment history', billing_current:'Current plan',
    // Settings
    settings_title:'Settings', settings_appearance:'Appearance',
    settings_theme:'Theme', settings_light:'Light', settings_dark:'Dark', settings_system:'System',
    settings_language:'Language', settings_account:'Account',
    settings_name:'Display name', settings_password:'Change password',
    settings_saved:'Settings saved',
    // Team
    team_title:'Team', team_new:'Add Team Member', team_name:'Full name',
    team_email:'Email', team_role:'Role', team_phone:'Phone (optional)',
    team_password:'Temporary password', team_save:'Add member',
    team_empty:'No team members yet.',
    // General
    save:'Save', cancel:'Cancel', close:'Close', delete:'Delete', edit:'Edit',
    loading:'Loading…', error:'Something went wrong. Please try again.',
    search:'Search…', confirm_delete:'Are you sure? This cannot be undone.',
    export_csv:'Export CSV', import_csv:'Import CSV',
    download_template:'Download template', upload_file:'Upload file',
    import_preview:'Import preview', import_btn:'Import records',
    valid_rows:'Valid rows', error_rows:'Errors',
    payment_cash:'Cash', payment_transfer:'Bank Transfer', payment_pos:'POS / Card',
    payment_ussd:'USSD', payment_opay:'OPay', payment_moniepoint:'Moniepoint',
    payment_credit:'Credit', payment_other:'Other',
    role_owner:'Owner', role_manager:'Manager', role_staff:'Staff', role_accountant:'Accountant',
    offline_banner:'You are offline. Sales will be saved and synced when you\'re back online.',
    pending_sync:'items pending sync',
    branch_all:'All Branches',
  },

  pcm: {
    nav_dashboard:'Dashboard', nav_pos:'Point of Sale', nav_sales:'Sales',
    nav_inventory:'Stock', nav_customers:'Customers', nav_expenses:'Expenses',
    nav_invoices:'Invoices', nav_analysis:'Business Analysis',
    nav_alerts:'Alerts', nav_reports:'Reports',
    nav_billing:'Billing & Plan', nav_settings:'Settings', nav_team:'Team',
    nav_logout:'Log out',
    login_title:'Welcome back', login_sub:'Log in make you run your business.',
    login_email:'Email address', login_password:'Password', login_btn:'Log in',
    login_no_acc:'You never get account?', login_create:'Create one',
    login_demo:'Demo: demo@pulsetrack.app / demo1234',
    reg_title:'Setup your business', reg_sub:'E no go reach one minute — no card needed.',
    reg_biz:'Business name', reg_industry:'Industry (optional)',
    reg_name:'Your name', reg_btn:'Create my business',
    reg_have:'You don get account already?', reg_signin:'Log in',
    dash_greet:'See how your business dey do',
    dash_rev_today:'Today Sales', dash_rev_7:'7-Day Sales',
    dash_gross_profit:'30-Day Gross Profit', dash_net_profit:'30-Day Net Profit',
    dash_low_stock:'Items Wey Low', dash_trend:'Sales — Last 14 Days',
    dash_top:'Best Sellers (7 days)', dash_branch:'Branch Performance',
    pos_title:'Point of Sale', pos_search:'Search product or scan barcode…',
    pos_cart:'Cart', pos_customer:'Customer (optional)', pos_walkin:'Walk-in customer',
    pos_payment:'How customer pay?', pos_discount:'Discount (₦)',
    pos_tendered:'Money wey dem give (₦)', pos_complete:'Complete Sale',
    pos_change:'Change', pos_empty_cart:'Cart empty',
    pos_quick:'Quick Products',
    inv_title:'Stock', inv_new:'Add Product', inv_export:'Export CSV',
    inv_import:'Import CSV', inv_adjust:'Adjust Stock', inv_history:'Stock History',
    inv_name:'Product name', inv_sku:'SKU', inv_barcode:'Barcode',
    inv_category:'Category', inv_cost:'Cost price (₦)', inv_price:'Selling price (₦)',
    inv_qty:'Quantity', inv_reorder:'Reorder level', inv_unit:'Unit',
    inv_service:'Service (no stock tracking)',
    inv_save:'Save product', inv_low_badge:'Low stock',
    inv_empty:'No product dey yet.',
    cust_title:'Customers', cust_new:'Add Customer', cust_name:'Full name',
    cust_phone:'Phone number', cust_email:'Email (optional)', cust_address:'Address',
    cust_type:'Customer type', cust_notes:'Notes', cust_spent:'Total wey dem spend',
    cust_last:'Last time dem buy', cust_at_risk:'At risk', cust_active:'Active',
    cust_save:'Save customer', cust_empty:'No customer dey yet.',
    exp_title:'Expenses', exp_new:'Add Expense', exp_category:'Category',
    exp_desc:'Description', exp_amount:'Amount (₦)', exp_date:'Date',
    exp_method:'Payment method', exp_save:'Save expense', exp_empty:'No expense dey yet.',
    inv2_title:'Invoices', inv2_new:'Create Invoice', inv2_num:'Invoice number',
    inv2_customer:'Customer', inv2_due:'Amount wey dem owe (₦)', inv2_paid:'Amount wey dem pay (₦)',
    inv2_date:'Due date', inv2_notes:'Notes', inv2_save:'Save invoice',
    inv2_pay:'Record payment', inv2_empty:'No invoice dey yet.',
    status_paid:'Don pay', status_unpaid:'No pay', status_partial:'Half pay', status_overdue:'E don pass time',
    analysis_title:'Business Analysis', analysis_sub:'Insights from your real business data.',
    analysis_best:'Best Sellers', analysis_slow:'Slow Movers',
    analysis_low_stock:'Items Need Restock', analysis_top_cust:'Top Customers',
    analysis_inactive:'Inactive Customers (30+ days)',
    alerts_title:'Alerts', alerts_mark_all:'Mark everything read', alerts_empty:'No alert dey.',
    reports_title:'Reports', reports_sales:'Sales Report',
    reports_pl:'Profit & Loss', reports_expenses:'Expense Breakdown',
    reports_from:'From', reports_to:'To',
    billing_title:'Billing & Plan', billing_usage:'How far with usage',
    billing_monthly:'Monthly', billing_annual:'Annual (2 months free)',
    billing_upgrade:'Upgrade', billing_cancel:'Cancel subscription',
    billing_history:'Payment history', billing_current:'Current plan',
    settings_title:'Settings', settings_appearance:'Appearance',
    settings_theme:'Theme', settings_light:'Light', settings_dark:'Dark', settings_system:'Match system',
    settings_language:'Language', settings_account:'Account',
    settings_name:'Display name', settings_password:'Change password', settings_saved:'Settings don save',
    team_title:'Team', team_new:'Add Team Member', team_name:'Full name',
    team_email:'Email', team_role:'Role', team_phone:'Phone (optional)',
    team_password:'Temporary password', team_save:'Add member', team_empty:'No team member dey yet.',
    save:'Save', cancel:'Cancel', close:'Close', delete:'Delete', edit:'Edit',
    loading:'E dey load…', error:'Something spoil. Try again.',
    search:'Search…', confirm_delete:'You sure say you wan delete this one?',
    export_csv:'Export CSV', import_csv:'Import CSV',
    download_template:'Download template', upload_file:'Upload file',
    import_preview:'Preview', import_btn:'Import records',
    valid_rows:'Valid rows', error_rows:'Errors',
    payment_cash:'Cash', payment_transfer:'Transfer', payment_pos:'POS / Card',
    payment_ussd:'USSD', payment_opay:'OPay', payment_moniepoint:'Moniepoint',
    payment_credit:'Credit', payment_other:'Other',
    role_owner:'Owner', role_manager:'Manager', role_staff:'Staff', role_accountant:'Accountant',
    offline_banner:'You dey offline. Sales go save and sync when internet return.',
    pending_sync:'items dey wait to sync',
    branch_all:'All Branches',
  },

  fr: {
    nav_dashboard:'Tableau de bord', nav_pos:'Point de vente', nav_sales:'Ventes',
    nav_inventory:'Inventaire', nav_customers:'Clients', nav_expenses:'Dépenses',
    nav_invoices:'Factures', nav_analysis:'Analyse commerciale',
    nav_alerts:'Alertes', nav_reports:'Rapports',
    nav_billing:'Facturation', nav_settings:'Paramètres', nav_team:'Équipe',
    nav_logout:'Déconnexion',
    login_title:'Bon retour', login_sub:'Connectez-vous pour gérer votre entreprise.',
    login_email:'Adresse e-mail', login_password:'Mot de passe', login_btn:'Se connecter',
    login_no_acc:"Pas encore de compte ?", login_create:'Créer',
    login_demo:'Démo : demo@pulsetrack.app / demo1234',
    reg_title:'Créer votre entreprise', reg_sub:"Moins d'une minute — sans carte.",
    reg_biz:"Nom de l'entreprise", reg_industry:'Secteur (optionnel)',
    reg_name:'Votre nom complet', reg_btn:'Créer mon entreprise',
    reg_have:'Déjà un compte ?', reg_signin:'Se connecter',
    dash_greet:"Voici les performances de votre entreprise",
    dash_rev_today:"Chiffre d'aujourd'hui", dash_rev_7:'Revenu 7 jours',
    dash_gross_profit:'Bénéfice brut 30 jours', dash_net_profit:'Bénéfice net 30 jours',
    dash_low_stock:'Articles en rupture', dash_trend:'Revenu — 14 derniers jours',
    dash_top:'Meilleures ventes (7 jours)', dash_branch:'Performance des agences',
    pos_title:'Point de vente', pos_search:'Rechercher un produit ou scanner…',
    pos_cart:'Panier', pos_customer:'Client (optionnel)', pos_walkin:'Client de passage',
    pos_payment:'Comment le client a-t-il payé ?', pos_discount:'Remise (₦)',
    pos_tendered:'Montant remis (₦)', pos_complete:'Finaliser la vente',
    pos_change:'Monnaie rendue', pos_empty_cart:'Panier vide',
    pos_quick:'Produits rapides',
    inv_title:'Inventaire', inv_new:'Ajouter produit', inv_export:'Exporter CSV',
    inv_import:'Importer CSV', inv_adjust:'Ajuster le stock', inv_history:'Historique stock',
    inv_name:'Nom du produit', inv_sku:'SKU', inv_barcode:'Code-barres',
    inv_category:'Catégorie', inv_cost:"Prix d'achat (₦)", inv_price:'Prix de vente (₦)',
    inv_qty:'Quantité initiale', inv_reorder:'Seuil de réapprovisionnement', inv_unit:'Unité',
    inv_service:'Service (pas de suivi de stock)',
    inv_save:'Enregistrer le produit', inv_low_badge:'Stock faible',
    inv_empty:'Aucun produit. Ajoutez votre premier produit.',
    cust_title:'Clients', cust_new:'Ajouter un client', cust_name:'Nom complet',
    cust_phone:'Téléphone', cust_email:'E-mail (optionnel)', cust_address:'Adresse',
    cust_type:'Type de client', cust_notes:'Notes', cust_spent:'Total dépensé',
    cust_last:'Dernier achat', cust_at_risk:'À risque', cust_active:'Actif',
    cust_save:'Enregistrer', cust_empty:'Aucun client.',
    exp_title:'Dépenses', exp_new:'Ajouter une dépense', exp_category:'Catégorie',
    exp_desc:'Description', exp_amount:'Montant (₦)', exp_date:'Date',
    exp_method:'Mode de paiement', exp_save:'Enregistrer', exp_empty:'Aucune dépense.',
    inv2_title:'Factures', inv2_new:'Créer une facture', inv2_num:'Numéro de facture',
    inv2_customer:'Client', inv2_due:'Montant dû (₦)', inv2_paid:'Montant payé (₦)',
    inv2_date:"Date d'échéance", inv2_notes:'Notes', inv2_save:'Enregistrer',
    inv2_pay:'Enregistrer un paiement', inv2_empty:'Aucune facture.',
    status_paid:'Payée', status_unpaid:'Impayée', status_partial:'Partiellement payée', status_overdue:'En retard',
    analysis_title:'Analyse commerciale', analysis_sub:'Insights générés à partir de vos données réelles.',
    analysis_best:'Meilleures ventes', analysis_slow:'Ventes lentes',
    analysis_low_stock:'À réapprovisionner', analysis_top_cust:'Meilleurs clients',
    analysis_inactive:'Clients inactifs (30+ jours)',
    alerts_title:'Alertes', alerts_mark_all:'Tout marquer comme lu', alerts_empty:'Aucune alerte.',
    reports_title:'Rapports', reports_sales:'Rapport de ventes',
    reports_pl:'Compte de résultat', reports_expenses:'Répartition des dépenses',
    reports_from:'Du', reports_to:'Au',
    billing_title:'Facturation', billing_usage:'Utilisation actuelle',
    billing_monthly:'Mensuel', billing_annual:'Annuel (2 mois offerts)',
    billing_upgrade:'Mettre à niveau', billing_cancel:'Résilier',
    billing_history:'Historique des paiements', billing_current:'Plan actuel',
    settings_title:'Paramètres', settings_appearance:'Apparence',
    settings_theme:'Thème', settings_light:'Clair', settings_dark:'Sombre', settings_system:'Système',
    settings_language:'Langue', settings_account:'Compte',
    settings_name:'Nom affiché', settings_password:'Changer le mot de passe', settings_saved:'Paramètres enregistrés',
    team_title:'Équipe', team_new:'Ajouter un membre', team_name:'Nom complet',
    team_email:'E-mail', team_role:'Rôle', team_phone:'Téléphone (optionnel)',
    team_password:'Mot de passe temporaire', team_save:'Ajouter', team_empty:'Aucun membre.',
    save:'Enregistrer', cancel:'Annuler', close:'Fermer', delete:'Supprimer', edit:'Modifier',
    loading:'Chargement…', error:"Une erreur s'est produite. Réessayez.",
    search:'Rechercher…', confirm_delete:'Êtes-vous sûr ? Cette action est irréversible.',
    export_csv:'Exporter CSV', import_csv:'Importer CSV',
    download_template:'Télécharger le modèle', upload_file:'Téléverser le fichier',
    import_preview:'Aperçu', import_btn:'Importer les enregistrements',
    valid_rows:'Lignes valides', error_rows:'Erreurs',
    payment_cash:'Espèces', payment_transfer:'Virement', payment_pos:'TPE/Carte',
    payment_ussd:'USSD', payment_opay:'OPay', payment_moniepoint:'Moniepoint',
    payment_credit:'Crédit', payment_other:'Autre',
    role_owner:'Propriétaire', role_manager:'Gérant', role_staff:'Personnel', role_accountant:'Comptable',
    offline_banner:'Vous êtes hors ligne. Les ventes seront synchronisées à la reconnexion.',
    pending_sync:'éléments en attente de synchronisation',
    branch_all:'Toutes les agences',
  },

  // Hausa, Yoruba, Igbo — key terms translated, others fall back to English
  ha: {
    nav_dashboard:'Dashboard', nav_pos:'Point of Sale', nav_sales:'Siyarwa',
    nav_inventory:'Kayan Ajiya', nav_customers:'Abokan Ciniki', nav_expenses:'Kashewa',
    nav_invoices:'Takardun Biyan Kuɗi', nav_analysis:'Nazarin Kasuwanci',
    nav_alerts:'Faɗakarwa', nav_reports:'Rahotanni',
    nav_billing:'Kuɗin Shiga', nav_settings:'Saiti', nav_team:'Ƙungiya', nav_logout:'Fita',
    login_title:'Barka da dawowa', login_sub:'Shiga don gudanar da kasuwancinka.',
    login_email:'Adreshin imel', login_password:'Kalmar sirri', login_btn:'Shiga',
    login_no_acc:"Ba ka da asusun?", login_create:'Ƙirƙira ɗaya',
    login_demo:'Demo: demo@pulsetrack.app / demo1234',
    reg_title:'Saita kasuwancinka', reg_sub:'Ƙasa da minti ɗaya.',
    reg_biz:'Sunan kasuwanci', reg_industry:'Masana\'antu (zaɓi)', reg_name:'Sunanka cikakke', reg_btn:'Ƙirƙiri kasuwancina',
    reg_have:'Kana da asusun?', reg_signin:'Shiga',
    dash_greet:'Ga yadda kasuwancinka yake', dash_rev_today:'Kuɗin Yau',
    dash_rev_7:'Kuɗi Makon 7', dash_gross_profit:'Riba ta 30 Kwana', dash_net_profit:'Net Riba ta 30 Kwana',
    dash_low_stock:'Kayan da suka Ƙare', dash_trend:'Kuɗin Shiga — Kwana 14 da suka wuce',
    dash_top:'Mafi Siyarwa (Mako 7)', dash_branch:'Aikin Reshe',
    pos_title:'Point of Sale', pos_search:'Nema kaya ko scan barcode…',
    pos_cart:'Kwandon Siyayya', pos_customer:'Abokin ciniki (zaɓi)', pos_walkin:'Baƙo',
    pos_payment:'Ta yaya abokin ciniki ya biya?', pos_discount:'Rangwame (₦)',
    pos_tendered:'Kuɗin da aka bayar (₦)', pos_complete:'Kammala Siyarwa',
    pos_change:'Canjin kuɗi', pos_empty_cart:'Kwandon yana wofi', pos_quick:'Kayan sauri',
    inv_title:'Kayan Ajiya', inv_new:'Ƙara Kaya', inv_export:'Fitar da CSV',
    inv_import:'Shigo da CSV', inv_adjust:'Daidaita Kaya', inv_history:'Tarihin Kaya',
    inv_name:'Sunan kaya', inv_sku:'SKU', inv_barcode:'Barcode', inv_category:'Nau\'i',
    inv_cost:'Farashin siyan (₦)', inv_price:'Farashin siyarwa (₦)', inv_qty:'Yawan farawa',
    inv_reorder:'Matakin sake siyan', inv_unit:'Naúrar', inv_service:'Sabis (babu bin kaya)',
    inv_save:'Ajiye kaya', inv_low_badge:'Kaya ya ƙare', inv_empty:'Babu kaya tukuna.',
    cust_title:'Abokan Ciniki', cust_new:'Ƙara Abokin Ciniki', cust_name:'Sunan cikakke',
    cust_phone:'Lambar waya', cust_email:'Imel (zaɓi)', cust_address:'Adireshi',
    cust_type:'Nau\'in abokin ciniki', cust_notes:'Bayanai', cust_spent:'Jimlar da aka kashewa',
    cust_last:'Sayan ƙarshe', cust_at_risk:'Yana cikin haɗari', cust_active:'Aiki',
    cust_save:'Ajiye', cust_empty:'Babu abokan ciniki tukuna.',
    exp_title:'Kashewa', exp_new:'Ƙara Kashewa', exp_category:'Nau\'i',
    exp_desc:'Bayani', exp_amount:'Adadi (₦)', exp_date:'Kwanan wata',
    exp_method:'Hanyar biyan kuɗi', exp_save:'Ajiye', exp_empty:'Babu kashewa tukuna.',
    inv2_title:'Takardun Kuɗi', inv2_new:'Ƙirƙiri Takarda', inv2_num:'Lambar takarda',
    inv2_customer:'Abokin ciniki', inv2_due:'Kuɗin da ake so (₦)', inv2_paid:'Kuɗin da aka biya (₦)',
    inv2_date:'Ranar ƙarshe', inv2_notes:'Bayanai', inv2_save:'Ajiye',
    inv2_pay:'Yi rikodin biyan kuɗi', inv2_empty:'Babu takardun kuɗi tukuna.',
    status_paid:'An biya', status_unpaid:'Ba a biya ba', status_partial:'An biya wani ɓangare', status_overdue:'Ya wuce lokaci',
    analysis_title:'Nazarin Kasuwanci', analysis_sub:'Bayanai daga bayanan kasuwancinka na gaske.',
    analysis_best:'Mafi Siyarwa', analysis_slow:'Kaya masu jinkiri', analysis_low_stock:'Bukatar sake siya',
    analysis_top_cust:'Manyan Abokan Ciniki', analysis_inactive:'Abokan Ciniki masu rashin aiki (kwana 30+)',
    alerts_title:'Faɗakarwa', alerts_mark_all:'Alama duka a karanta', alerts_empty:'Babu faɗakarwa.',
    reports_title:'Rahotanni', reports_sales:'Rahoto na Siyarwa', reports_pl:'Riba da Hasara',
    reports_expenses:'Rarraba Kashewa', reports_from:'Daga', reports_to:'Zuwa',
    billing_title:'Kuɗin Shiga', billing_usage:'Amfani na yanzu',
    billing_monthly:'Wata-wata', billing_annual:'Shekara-shekara (watanni 2 kyauta)',
    billing_upgrade:'Inganta', billing_cancel:'Soke', billing_history:'Tarihin biyan kuɗi', billing_current:'Shirin yanzu',
    settings_title:'Saiti', settings_appearance:'Bayyanar', settings_theme:'Yanayi',
    settings_light:'Haske', settings_dark:'Duhu', settings_system:'Na tsarin',
    settings_language:'Yare', settings_account:'Asusun', settings_name:'Sunan nuni',
    settings_password:'Canza kalmar sirri', settings_saved:'An adana saiti',
    team_title:'Ƙungiya', team_new:'Ƙara Memba', team_name:'Sunan cikakke', team_email:'Imel',
    team_role:'Matsayi', team_phone:'Waya (zaɓi)', team_password:'Kalmar sirri ta wucin gadi',
    team_save:'Ƙara memba', team_empty:'Babu membobi tukuna.',
    save:'Ajiye', cancel:'Soke', close:'Rufe', delete:'Share', edit:'Gyara',
    loading:'Ana loda…', error:'Wani abu ya ɓaci. Gwada again.',
    search:'Bincika…', confirm_delete:'Kana tabbata? Ba za a iya mayarwa ba.',
    export_csv:'Fitar da CSV', import_csv:'Shigo da CSV',
    download_template:'Zazzage samfurin', upload_file:'Loda fayil',
    import_preview:'Duba kafin shigowa', import_btn:'Shigo da rikodin',
    valid_rows:'Layukan da ke aiki', error_rows:'Kurakurai',
    payment_cash:'Kuɗi hannu', payment_transfer:'Canja wurin banki', payment_pos:'POS / Kati',
    payment_ussd:'USSD', payment_opay:'OPay', payment_moniepoint:'Moniepoint',
    payment_credit:'Bashi', payment_other:'Wani',
    role_owner:'Mai Kasuwanci', role_manager:'Manaja', role_staff:'Ma\'aikaci', role_accountant:'Mai lissafi',
    offline_banner:'Ba ka da intanet. Za a adana siyarwa kuma a aika idan intanet ta dawo.',
    pending_sync:'abubuwa suna jiran aika',
    branch_all:'Dukkan Reshe',
  },

  yo: {
    nav_dashboard:'Dasibodu', nav_pos:'Ipo Tita', nav_sales:'Tita',
    nav_inventory:'Ọja', nav_customers:'Onibara', nav_expenses:'Inawo',
    nav_invoices:'Iwe Owo', nav_analysis:'Itupalẹ Iṣowo',
    nav_alerts:'Ikilọ', nav_reports:'Iroyin',
    nav_billing:'Isanwo', nav_settings:'Eto', nav_team:'Egbe', nav_logout:'Jade',
    login_title:'E kaabo pada', login_sub:'Wọle lati ṣakoso iṣowo rẹ.',
    login_email:'Adirẹsi imeeli', login_password:'Ọrọ aṣina', login_btn:'Wọle',
    login_no_acc:"Ṣe o ni akọọlẹ?", login_create:'Ṣẹda ọkan',
    login_demo:'Demo: demo@pulsetrack.app / demo1234',
    reg_title:'Ṣeto iṣowo rẹ', reg_sub:'Kere ju iṣẹju kan — ko si kaadi ti a nilo.',
    reg_biz:'Orukọ iṣowo', reg_industry:'Ile-iṣẹ (aṣayan)', reg_name:'Orukọ rẹ ni kikun', reg_btn:'Ṣẹda iṣowo mi',
    reg_have:'Ṣe o ti ni akọọlẹ?', reg_signin:'Wọle',
    dash_greet:'Wo bi iṣowo rẹ ṣe n lọ',
    dash_rev_today:'Owo Oni', dash_rev_7:'Owo 7-Ọjọ',
    dash_gross_profit:'Ere Lapapọ 30-Ọjọ', dash_net_profit:'Ere Rere 30-Ọjọ',
    dash_low_stock:'Ọja Ti O Fẹ Parẹ', dash_trend:'Owo — Ọjọ 14 Sẹyin',
    dash_top:'Awọn Ọja Ti O Ta Julọ (7 Ọjọ)', dash_branch:'Iṣẹ Ẹka',
    pos_title:'Ipo Tita', pos_search:'Wa ọja tabi ṣayẹwo barcode…',
    pos_cart:'Agbọn Rira', pos_customer:'Onibara (aṣayan)', pos_walkin:'Onibara tuntun',
    pos_payment:'Bawo ni onibara ṣe san?', pos_discount:'Ẹdinwo (₦)',
    pos_tendered:'Owo ti a san (₦)', pos_complete:'Pari Tita',
    pos_change:'Iyipada', pos_empty_cart:'Agbọn ṣofo', pos_quick:'Awọn Ọja Yara',
    inv_title:'Ọja', inv_new:'Fi Ọja Kun', inv_export:'Okeere CSV',
    inv_import:'Wọle CSV', inv_adjust:'Ṣatunṣe Ọja', inv_history:'Itan Ọja',
    inv_name:'Orukọ ọja', inv_sku:'SKU', inv_barcode:'Barcode', inv_category:'Ẹka',
    inv_cost:'Iye rira (₦)', inv_price:'Iye tita (₦)', inv_qty:'Iye akọkọ',
    inv_reorder:'Ipele atunṣe', inv_unit:'Apakan', inv_service:'Iṣẹ (ko si itọpa ọja)',
    inv_save:'Fipamọ ọja', inv_low_badge:'Ọja ti n pari', inv_empty:'Ko si ọja sibẹsibẹ.',
    cust_title:'Onibara', cust_new:'Fi Onibara Kun', cust_name:'Orukọ ni kikun',
    cust_phone:'Nọmba fonu', cust_email:'Imeeli (aṣayan)', cust_address:'Adirẹsi',
    cust_type:'Iru onibara', cust_notes:'Awọn akọsilẹ', cust_spent:'Lapapọ ti o lo',
    cust_last:'Rira kẹhin', cust_at_risk:'Ni ewu', cust_active:'Ṣiṣe',
    cust_save:'Fipamọ', cust_empty:'Ko si onibara sibẹsibẹ.',
    exp_title:'Inawo', exp_new:'Fi Inawo Kun', exp_category:'Ẹka',
    exp_desc:'Apejuwe', exp_amount:'Iye (₦)', exp_date:'Ọjọ', exp_method:'Ọna isanwo',
    exp_save:'Fipamọ', exp_empty:'Ko si inawo sibẹsibẹ.',
    inv2_title:'Iwe Owo', inv2_new:'Ṣẹda Iwe Owo', inv2_num:'Nọmba iwe owo',
    inv2_customer:'Onibara', inv2_due:'Iye ti a jẹ (₦)', inv2_paid:'Iye ti a san (₦)',
    inv2_date:'Ọjọ ipari', inv2_notes:'Akọsilẹ', inv2_save:'Fipamọ',
    inv2_pay:'Gbasilẹ isanwo', inv2_empty:'Ko si iwe owo sibẹsibẹ.',
    status_paid:'Ti a san', status_unpaid:'Ko san', status_partial:'Ti san diẹ', status_overdue:'Ti kọjá akoko',
    analysis_title:'Itupalẹ Iṣowo', analysis_sub:'Awọn oye lati data iṣowo rẹ gangan.',
    analysis_best:'Awọn Ọja Ti O Ta Julọ', analysis_slow:'Awọn Ọja Ti O Lọra',
    analysis_low_stock:'Nilo Atunṣe', analysis_top_cust:'Awọn Onibara Akọkọ',
    analysis_inactive:'Onibara Ti Ko Nṣiṣẹ (30+ Ọjọ)',
    alerts_title:'Ikilọ', alerts_mark_all:'Samisi gbogbo bi a ti ka', alerts_empty:'Ko si ikilọ.',
    reports_title:'Iroyin', reports_sales:'Iroyin Tita', reports_pl:'Owo ati Padanu',
    reports_expenses:'Pipin Inawo', reports_from:'Lati', reports_to:'Si',
    billing_title:'Isanwo', billing_usage:'Lilo lọwọlọwọ',
    billing_monthly:'Oṣooṣu', billing_annual:'Lọdọọdún (oṣu 2 ọfẹ)',
    billing_upgrade:'Igbega', billing_cancel:'Fagilee', billing_history:'Itan isanwo', billing_current:'Eto lọwọlọwọ',
    settings_title:'Eto', settings_appearance:'Irisi', settings_theme:'Akori',
    settings_light:'Imọlẹ', settings_dark:'Okunkun', settings_system:'Eto',
    settings_language:'Ede', settings_account:'Akọọlẹ', settings_name:'Orukọ ifihan',
    settings_password:'Yi ọrọ aṣina pada', settings_saved:'Eto ti fipamọ',
    team_title:'Egbe', team_new:'Fi Ọmọ Egbe Kun', team_name:'Orukọ ni kikun',
    team_email:'Imeeli', team_role:'Ipa', team_phone:'Fonu (aṣayan)',
    team_password:'Ọrọ aṣina igba diẹ', team_save:'Fi kun', team_empty:'Ko si ọmọ egbe sibẹsibẹ.',
    save:'Fipamọ', cancel:'Fagilee', close:'Paade', delete:'Pa', edit:'Ṣatunṣe',
    loading:'Ẹ duro…', error:'Ohun kan sẹ. Gbiyanju lẹẹkansi.',
    search:'Wa…', confirm_delete:'Ṣe o daju? Eyi ko le yipada pada.',
    export_csv:'Okeere CSV', import_csv:'Wọle CSV',
    download_template:'Ṣe igbasilẹ awoṣe', upload_file:'Gbe faili soke',
    import_preview:'Aworan iṣaaju', import_btn:'Gbe awọn igbasilẹ wọle',
    valid_rows:'Awọn ila ti o wulo', error_rows:'Awọn aṣiṣe',
    payment_cash:'Owo ọwọ', payment_transfer:'Gbigbe banki', payment_pos:'POS / Kaadi',
    payment_ussd:'USSD', payment_opay:'OPay', payment_moniepoint:'Moniepoint',
    payment_credit:'Kirẹditi', payment_other:'Miiran',
    role_owner:'Oniwun', role_manager:'Oluṣakoso', role_staff:'Oṣiṣẹ', role_accountant:'Akauntan',
    offline_banner:'O wa lailaini. Tita yoo fipamọ ati fifiranṣẹ nigbati intanẹẹti ba pada.',
    pending_sync:'awọn nkan nduro lati firanṣẹ',
    branch_all:'Gbogbo Ẹka',
  },

  ig: {
    nav_dashboard:'Dashboard', nav_pos:'Ebe Ire Ahịa', nav_sales:'Ire Ahịa',
    nav_inventory:'Ihe Ndị Ahịa', nav_customers:'Ndị Ahịa', nav_expenses:'Ihe Eji Ego',
    nav_invoices:'Akwụkwọ Ọnụ Ahịa', nav_analysis:'Nyocha Azụmahịa',
    nav_alerts:'Ọkwa Ihe Ize Ndụ', nav_reports:'Akụkọ',
    nav_billing:'Ịkwụ Ụgwọ', nav_settings:'Ntọala', nav_team:'Ndị Otu', nav_logout:'Pụọ',
    login_title:'Nnọọ laba', login_sub:'Banye iji ijikwa azụmahịa gị.',
    login_email:'Adreesị ịmẹlụ', login_password:'Okwuntughe', login_btn:'Banye',
    login_no_acc:"Ị nweghị akaụntụ?", login_create:'Mepụta otu',
    login_demo:'Demo: demo@pulsetrack.app / demo1234',
    reg_title:'Tọọ azụmahịa gị', reg_sub:'Ihe na-erughị nkeji otu — ọ dịghị kaadị dị mkpa.',
    reg_biz:'Aha azụmahịa', reg_industry:'Ụlọ ọrụ (nhọrọ)', reg_name:'Aha gị zuru oke', reg_btn:'Mepụta azụmahịa m',
    reg_have:'Ị nwere akaụntụ?', reg_signin:'Banye',
    dash_greet:'Nọchie anya ka azụmahịa gị si aga',
    dash_rev_today:'Ego Taa', dash_rev_7:'Ego Izu 7',
    dash_gross_profit:'Uru Brọs 30 Ụbọchị', dash_net_profit:'Uru Edum 30 Ụbọchị',
    dash_low_stock:'Ihe Ndị Na-acha Ọcha', dash_trend:'Ego — Ụbọchị 14 Gara Aga',
    dash_top:'Ihe Ndị Ire Kachasị Mma (Izu 7)', dash_branch:'Ọrụ Ngalaba',
    pos_title:'Ebe Ire Ahịa', pos_search:'Chọọ ihe ma ọ bụ nyochaa barcode…',
    pos_cart:'Ngwugwu Ịzụ Ahịa', pos_customer:'Onye Ahịa (nhọrọ)', pos_walkin:'Onye Ahịa Ọhụrụ',
    pos_payment:'Kedu ka onye ahịa si kwụọ ụgwọ?', pos_discount:'Mbelata Ọnụ Ahịa (₦)',
    pos_tendered:'Ego e nyere (₦)', pos_complete:'Mechie Ire Ahịa',
    pos_change:'Mgbanwe', pos_empty_cart:'Ngwugwu adịghị', pos_quick:'Ihe Ngwa Ngwa',
    inv_title:'Ihe Ndị Ahịa', inv_new:'Tinye Ihe Ahịa', inv_export:'Mepụta CSV',
    inv_import:'Webata CSV', inv_adjust:'Dozie Ihe Ahịa', inv_history:'Akụkọ Ihe Ahịa',
    inv_name:'Aha ihe ahịa', inv_sku:'SKU', inv_barcode:'Barcode', inv_category:'Ụdị',
    inv_cost:'Ọnụ ahịa ịzụ (₦)', inv_price:'Ọnụ ahịa ire (₦)', inv_qty:'Ọnụọgụ mbido',
    inv_reorder:'Ọkwa ọzọ ịzụ', inv_unit:'Ngalari', inv_service:'Ọrụ (enweghị nsochi ihe ahịa)',
    inv_save:'Chekwaa ihe ahịa', inv_low_badge:'Ihe ahịa na-acha', inv_empty:'Enweghị ihe ahịa ọbụna.',
    cust_title:'Ndị Ahịa', cust_new:'Tinye Onye Ahịa', cust_name:'Aha zuru oke',
    cust_phone:'Nọmba ekwentị', cust_email:'Ịmẹlụ (nhọrọ)', cust_address:'Adreesị',
    cust_type:'Ụdị onye ahịa', cust_notes:'Ndekọ', cust_spent:'Naanị ego o ji',
    cust_last:'Ịzụ ahịa ikpeazụ', cust_at_risk:'N\'ọnọ ihe ize ndụ', cust_active:'Na-arụ ọrụ',
    cust_save:'Chekwaa', cust_empty:'Enweghị ndị ahịa ọbụna.',
    exp_title:'Ihe Eji Ego', exp_new:'Tinye Ihe Eji Ego', exp_category:'Ụdị',
    exp_desc:'Nkọwa', exp_amount:'Ego (₦)', exp_date:'Ụbọchị', exp_method:'Ụzọ ịkwụ ụgwọ',
    exp_save:'Chekwaa', exp_empty:'Enweghị ihe eji ego ọbụna.',
    inv2_title:'Akwụkwọ Ọnụ Ahịa', inv2_new:'Mepụta Akwụkwọ Ọnụ Ahịa', inv2_num:'Nọmba akwụkwọ',
    inv2_customer:'Onye Ahịa', inv2_due:'Ego e ji (₦)', inv2_paid:'Ego akwụọla (₦)',
    inv2_date:'Ụbọchị njedebe', inv2_notes:'Ndekọ', inv2_save:'Chekwaa',
    inv2_pay:'Deba ịkwụ ụgwọ', inv2_empty:'Enweghị akwụkwọ ọnụ ahịa ọbụna.',
    status_paid:'Akwụọla', status_unpaid:'Akwụghịọla', status_partial:'Akwụọla ụfọdụ', status_overdue:'Gakwuola oge',
    analysis_title:'Nyocha Azụmahịa', analysis_sub:'Ihe ọmụma si na data azụmahịa gị.',
    analysis_best:'Ihe Ire Kachasị Mma', analysis_slow:'Ihe Na-ere Nta',
    analysis_low_stock:'Chọrọ Ọzọ Ịzụ', analysis_top_cust:'Ndị Ahịa Kachasị Mma',
    analysis_inactive:'Ndị Ahịa Na-anọghị Arụọrụ (30+ Ụbọchị)',
    alerts_title:'Ọkwa', alerts_mark_all:'Kee ihe niile ka agụọla', alerts_empty:'Enweghị ọkwa.',
    reports_title:'Akụkọ', reports_sales:'Akụkọ Ire Ahịa', reports_pl:'Uru na Mfu',
    reports_expenses:'Nkewa Ihe Eji Ego', reports_from:'Site', reports_to:'Ruo',
    billing_title:'Ịkwụ Ụgwọ', billing_usage:'Ojiji ugbu a',
    billing_monthly:'Ọnwa Nọọ Ọnwa', billing_annual:'Afọ nọọ Afọ (ọnwa 2 n\'efu)',
    billing_upgrade:'Kwalite', billing_cancel:'Kagbuo', billing_history:'Akụkọ ịkwụ ụgwọ', billing_current:'Atụmatụ ugbu a',
    settings_title:'Ntọala', settings_appearance:'Ọdịdị', settings_theme:'Akụkọ Ihe Ọmụma',
    settings_light:'Ìhè', settings_dark:'Ọchịchọ', settings_system:'Usoro',
    settings_language:'Asụsụ', settings_account:'Akaụntụ', settings_name:'Aha ngosipụta',
    settings_password:'Gbanwee okwuntughe', settings_saved:'Achekwaa ntọala',
    team_title:'Ndị Otu', team_new:'Tinye Onye Otu', team_name:'Aha zuru oke',
    team_email:'Ịmẹlụ', team_role:'Ọrụ', team_phone:'Ekwentị (nhọrọ)',
    team_password:'Okwuntughe oge a na-ejighi anya', team_save:'Tinye onye', team_empty:'Enweghị onye otu ọbụna.',
    save:'Chekwaa', cancel:'Kagbuo', close:'Mechie', delete:'Hichapụ', edit:'Dezie',
    loading:'Na-ebugharị…', error:'Ihe mere nke ọjọọ. Nọchiana ọzọ.',
    search:'Chọọ…', confirm_delete:'Ị na-ekwenye? Enweghị ike iweghachi ya.',
    export_csv:'Mepụta CSV', import_csv:'Webata CSV',
    download_template:'Budata ụdị', upload_file:'Bulite faịlụ',
    import_preview:'Nleleghachi', import_btn:'Webata ndekọ',
    valid_rows:'Ahịrị ndị dị mma', error_rows:'Njehie',
    payment_cash:'Ego n\'aka', payment_transfer:'Ntransfọọ ụlọ akụ', payment_pos:'POS / Kaadị',
    payment_ussd:'USSD', payment_opay:'OPay', payment_moniepoint:'Moniepoint',
    payment_credit:'Kredit', payment_other:'Ihe Ọzọ',
    role_owner:'Onye Nwe', role_manager:'Onye Njikwa', role_staff:'Ndị Ọrụ', role_accountant:'Onye Akwụkwọ Ego',
    offline_banner:'Ị nọ offline. Ire ahịa ga-echekwaa ma ziga mgbe ịntanetị laghachiri.',
    pending_sync:'ihe ndị na-abiara iza',
    branch_all:'Ngalaba Niile',
  },
};

const I18nCtx = createContext(null);
export function I18nProvider({ children, initLang }) {
  const [lang, _setLang] = useState(initLang || localStorage.getItem('pt-lang') || 'en');
  useEffect(() => { if (initLang && initLang !== lang) _setLang(initLang); }, [initLang]);

  const setLang = useCallback((l) => {
    _setLang(l);
    localStorage.setItem('pt-lang', l);
    document.documentElement.lang = l;
  }, []);

  // t('key') or t('key', { n: 3 }) — falls back: language → English → key
  const t = useCallback((key, vars) => {
    const raw = T[lang]?.[key] ?? EXTRA[lang]?.[key] ?? T.en[key] ?? EXTRA.en[key] ?? key;
    return vars ? raw.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`)) : raw;
  }, [lang]);

  const val = useMemo(() => ({ lang, setLang, t, languages: LANGUAGES }), [lang, setLang, t]);
  return <I18nCtx.Provider value={val}>{children}</I18nCtx.Provider>;
}
export const useI18n = () => useContext(I18nCtx);
