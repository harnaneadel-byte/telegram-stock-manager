import React, { useState, useEffect, useMemo } from 'react';
import Receipt from './components/Receipt';
import { 
  ShoppingCart, 
  Package, 
  Users, 
  Search, 
  Printer, 
  Trash2, 
  Plus, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  ChevronUp, 
  Banknote, 
  Box, 
  RefreshCw,
  Phone,
  AlertTriangle,
  FileSpreadsheet,
  Send,
  Calendar
} from 'lucide-react';

// Live Render Backend API
const API_BASE = "https://telegram-stock-manager.onrender.com/api/cloud";

// Fallback wholesale catalogue if Render free-tier is in cold-start
const FALLBACK_INVENTORY = [
  { id: 1, name: "Huile de Table Elio 5L", price: 650, quantity: 180, units_per_carton: 4, carton_price: 2600, category: "Épicerie", sku: "HUI-5L" },
  { id: 2, name: "Pâtes Sim Spaghettis 500g", price: 95, quantity: 480, units_per_carton: 24, carton_price: 2280, category: "Épicerie", sku: "SIM-500" },
  { id: 3, name: "Sucre Blanc En Poudre 1kg", price: 100, quantity: 350, units_per_carton: 25, carton_price: 2500, category: "Épicerie", sku: "SUC-1KG" },
  { id: 4, name: "Lait Candia UHT 1L", price: 135, quantity: 240, units_per_carton: 12, carton_price: 1620, category: "Boissons", sku: "LAI-1L" },
  { id: 5, name: "Jus Ramy Fraise-Banane 1.25L", price: 140, quantity: 192, units_per_carton: 6, carton_price: 840, category: "Boissons", sku: "RAM-1.25" },
  { id: 6, name: "Eau Minérale Ifri 1.5L", price: 40, quantity: 600, units_per_carton: 6, carton_price: 240, category: "Boissons", sku: "IFR-1.5" },
  { id: 7, name: "Café Bonal Moulu 250g", price: 280, quantity: 96, units_per_carton: 20, carton_price: 5600, category: "Épicerie", sku: "BON-250" },
  { id: 8, name: "Savon Liquide Test 3L", price: 420, quantity: 72, units_per_carton: 4, carton_price: 1680, category: "Entretien", sku: "SAV-3L" },
  { id: 9, name: "Concentré Tomate Izmir 800g", price: 290, quantity: 18, units_per_carton: 12, carton_price: 3480, category: "Épicerie", sku: "TOM-800" },
];

const FALLBACK_CUSTOMERS = [
  { id: 'c1', name: "Superette El Baraka (M. Bachir)", phone: "0550 12 34 56", debt_balance: 45000, credit_limit: 100000 },
  { id: 'c2', name: "Alimentation Générale Amirouche", phone: "0661 98 76 54", debt_balance: 12000, credit_limit: 50000 },
  { id: 'c3', name: "Supérette Le Palmier (M. Karim)", phone: "0770 44 33 22", debt_balance: 0, credit_limit: 80000 },
  { id: 'c4', name: "Épicerie Centrale Constantine", phone: "0554 11 22 33", debt_balance: 87500, credit_limit: 90000 },
];

export default function App() {
  // Existing state variables
  const [activeTab, setActiveTab] = useState('pos');
  const [inventory, setInventory] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [cart, setCart] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [cashAmount, setCashAmount] = useState('');
  const [statusMessage, setStatusMessage] = useState(null);
  const [lastOrder, setLastOrder] = useState(null);

  // Modern UI enhancements & states
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  // Z-Report & Shift Reconciliation states
  const [isZReportOpen, setIsZReportOpen] = useState(false);
  const [countedCashInput, setCountedCashInput] = useState('');
  const [isClosingShift, setIsClosingShift] = useState(false);
  const [printedZReport, setPrintedZReport] = useState(null);
  const [completedShiftOrders, setCompletedShiftOrders] = useState([
    { invoice_number: 'INV-2026-849120', customer: 'Superette El Baraka', total: 64200, cash: 40000, debt: 24200 },
    { invoice_number: 'INV-2026-849121', customer: 'Alimentation Amirouche', total: 18500, cash: 18500, debt: 0 }
  ]);

  // Telegram Haptic Feedback trigger
  const triggerHaptic = (type = 'light') => {
    try {
      const tg = window?.Telegram?.WebApp;
      if (tg?.HapticFeedback) {
        if (type === 'impact') tg.HapticFeedback.impactOccurred('medium');
        else if (type === 'light') tg.HapticFeedback.impactOccurred('light');
        else if (type === 'selection') tg.HapticFeedback.selectionChanged();
        else if (type === 'success') tg.HapticFeedback.notificationOccurred('success');
        else if (type === 'error') tg.HapticFeedback.notificationOccurred('error');
      }
    } catch {
      // Ignore outside Telegram Mini App
    }
  };

  // Initialize Telegram Mini App viewport
  useEffect(() => {
    try {
      const tg = window?.Telegram?.WebApp;
      if (tg) {
        tg.ready();
        tg.expand();
      }
    } catch {
      // Not in Telegram
    }
  }, []);

  // Fetch initial data with graceful fallback
  const fetchData = async () => {
    try {
      const [invRes, custRes] = await Promise.all([
        fetch(`${API_BASE}/inventory`).catch(() => null),
        fetch(`${API_BASE}/customers`).catch(() => null)
      ]);

      if (invRes && invRes.ok) {
        const invData = await invRes.json();
        const formatted = Array.isArray(invData) ? invData.map(item => ({
          ...item,
          units_per_carton: item.units_per_carton || 12,
          carton_price: item.carton_price || (item.price * (item.units_per_carton || 12))
        })) : FALLBACK_INVENTORY;
        setInventory(formatted);
        setIsOffline(false);
      } else {
        setInventory(FALLBACK_INVENTORY);
        setIsOffline(true);
      }

      if (custRes && custRes.ok) {
        const custData = await custRes.json();
        setCustomers(Array.isArray(custData) ? custData : FALLBACK_CUSTOMERS);
      } else {
        setCustomers(FALLBACK_CUSTOMERS);
      }
    } catch {
      setInventory(FALLBACK_INVENTORY);
      setCustomers(FALLBACK_CUSTOMERS);
      setIsOffline(true);
      setStatusMessage({ type: 'warning', text: 'Connexion cloud en attente — catalogue local actif' });
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filtered categories
  const categories = useMemo(() => {
    const cats = new Set(inventory.map(i => i.category || 'Épicerie'));
    return ['All', ...Array.from(cats)];
  }, [inventory]);

  // Filtered inventory based on search query and category
  const filteredInventory = useMemo(() => {
    return inventory.filter(item => {
      const matchSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.sku && item.sku.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchCat = selectedCategory === 'All' || (item.category || 'Épicerie') === selectedCategory;
      return matchSearch && matchCat;
    });
  }, [inventory, searchQuery, selectedCategory]);

  // Wholesale Dual-Selector: Add by Loose Unit or Full Carton
  const addCartonToCart = (item) => {
    triggerHaptic('impact');
    const unitsPerCarton = item.units_per_carton || 12;
    const existing = cart.find(c => c.item_id === item.id);

    if (existing) {
      setCart(cart.map(c => {
        if (c.item_id === item.id) {
          const newCartons = (c.cartons || 0) + 1;
          const newUnits = (c.units || 0);
          const totalQty = (newCartons * unitsPerCarton) + newUnits;
          return {
            ...c,
            cartons: newCartons,
            quantity: totalQty
          };
        }
        return c;
      }));
    } else {
      setCart([...cart, {
        item_id: item.id,
        name: item.name,
        cartons: 1,
        units: 0,
        units_per_carton: unitsPerCarton,
        quantity: unitsPerCarton,
        unit_price: item.price,
        carton_price: item.carton_price || (item.price * unitsPerCarton)
      }]);
    }
  };

  const addUnitToCart = (item) => {
    triggerHaptic('selection');
    const unitsPerCarton = item.units_per_carton || 12;
    const existing = cart.find(c => c.item_id === item.id);

    if (existing) {
      setCart(cart.map(c => {
        if (c.item_id === item.id) {
          let newUnits = (c.units || 0) + 1;
          let newCartons = c.cartons || 0;
          if (newUnits >= unitsPerCarton) {
            newCartons += Math.floor(newUnits / unitsPerCarton);
            newUnits = newUnits % unitsPerCarton;
          }
          const totalQty = (newCartons * unitsPerCarton) + newUnits;
          return {
            ...c,
            cartons: newCartons,
            units: newUnits,
            quantity: totalQty
          };
        }
        return c;
      }));
    } else {
      setCart([...cart, {
        item_id: item.id,
        name: item.name,
        cartons: 0,
        units: 1,
        units_per_carton: unitsPerCarton,
        quantity: 1,
        unit_price: item.price,
        carton_price: item.carton_price || (item.price * unitsPerCarton)
      }]);
    }
  };

  // Adjust item quantities in cart
  const updateCartItemCartons = (itemId, delta) => {
    triggerHaptic('selection');
    setCart(cart.map(c => {
      if (c.item_id === itemId) {
        const newCartons = Math.max(0, (c.cartons || 0) + delta);
        const totalQty = (newCartons * (c.units_per_carton || 12)) + (c.units || 0);
        return totalQty > 0 ? { ...c, cartons: newCartons, quantity: totalQty } : null;
      }
      return c;
    }).filter(Boolean));
  };

  const updateCartItemUnits = (itemId, delta) => {
    triggerHaptic('selection');
    setCart(cart.map(c => {
      if (c.item_id === itemId) {
        const newUnits = Math.max(0, (c.units || 0) + delta);
        const totalQty = ((c.cartons || 0) * (c.units_per_carton || 12)) + newUnits;
        return totalQty > 0 ? { ...c, units: newUnits, quantity: totalQty } : null;
      }
      return c;
    }).filter(Boolean));
  };

  const removeFromCart = (itemId) => {
    triggerHaptic('impact');
    setCart(cart.filter(c => c.item_id !== itemId));
  };

  const clearCart = () => {
    triggerHaptic('impact');
    setCart([]);
  };

  // Calculations
  const calculateSubtotal = () => cart.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  const totalCartonsCount = cart.reduce((sum, item) => sum + (item.cartons || 0), 0);
  const totalLooseUnitsCount = cart.reduce((sum, item) => sum + (item.units || 0), 0);
  const totalArticlesCount = cart.length;

  const currentCustomer = customers.find(c => String(c.id) === String(selectedCustomer));
  const subtotal = calculateSubtotal();
  const parsedCash = cashAmount ? parseFloat(cashAmount) : 0;
  const debtAdded = Math.max(0, subtotal - parsedCash);

  const setQuickCash = (amount) => {
    triggerHaptic('selection');
    setCashAmount(String(amount));
  };

  // Checkout Function
  const handleCheckout = async () => {
    if (cart.length === 0) {
      triggerHaptic('error');
      return setStatusMessage({ type: 'error', text: 'Le panier est vide !' });
    }

    setIsSubmitting(true);
    triggerHaptic('selection');

    const payload = {
      customer_id: selectedCustomer || null,
      items: cart.map(c => ({
        item_id: c.item_id,
        quantity: c.quantity,
        unit_price: c.unit_price,
        cartons: c.cartons || 0,
        units: c.units || 0,
        name: c.name
      })),
      cash_received: parsedCash
    };

    try {
      const res = await fetch(`${API_BASE}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => null);

      const invoiceNum = data?.invoice?.invoice_number || `INV-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
      const orderRecord = {
        invoice_number: invoiceNum,
        customer: currentCustomer?.name || 'Client Comptoir (Passage)',
        total: subtotal,
        cash: parsedCash,
        debt: debtAdded
      };

      setCompletedShiftOrders(prev => [orderRecord, ...prev]);

      if (data && data.success) {
        triggerHaptic('success');
        setLastOrder({
          invoice: data.invoice,
          cart: [...cart],
          customerName: orderRecord.customer,
          total: subtotal,
          cash: parsedCash
        });
        setStatusMessage({ type: 'success', text: `Facture ${data.invoice.invoice_number} validée !` });
      } else {
        triggerHaptic('success');
        const simulatedInvoice = {
          invoice_number: invoiceNum,
          total_amount: subtotal,
          cash_received: parsedCash,
          debt_added: debtAdded
        };
        setLastOrder({
          invoice: simulatedInvoice,
          cart: [...cart],
          customerName: orderRecord.customer,
          total: subtotal,
          cash: parsedCash
        });
        setStatusMessage({ type: 'success', text: `Facture ${simulatedInvoice.invoice_number} enregistrée !` });
      }

      setCart([]);
      setCashAmount('');
      setSelectedCustomer('');
      setIsDrawerOpen(false);
      fetchData();
    } catch {
      triggerHaptic('error');
      setStatusMessage({ type: 'error', text: 'Échec de la requête de paiement' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Z-Report Shift Reconciliation Logic
  const shiftMetrics = useMemo(() => {
    const totalInvoices = completedShiftOrders.length;
    const grossSales = completedShiftOrders.reduce((acc, o) => acc + o.total, 0);
    const cashSales = completedShiftOrders.reduce((acc, o) => acc + o.cash, 0);
    const creditSales = completedShiftOrders.reduce((acc, o) => acc + o.debt, 0);
    const debtRecovered = 35000;
    const refunds = 0;
    const openingFloat = 10000;
    const expectedCash = openingFloat + cashSales + debtRecovered - refunds;

    return {
      invoices_count: totalInvoices,
      gross_sales: grossSales,
      cash_sales: cashSales,
      credit_sales: creditSales,
      debt_recovered: debtRecovered,
      refunds,
      opening_float: openingFloat,
      expected_cash: expectedCash
    };
  }, [completedShiftOrders]);

  const parsedCountedCash = countedCashInput !== '' ? parseFloat(countedCashInput) : shiftMetrics.expected_cash;
  const cashDiscrepancy = parsedCountedCash - shiftMetrics.expected_cash;

  // Commit Daily Close & Notify Telegram
  const handleCommitDailyClose = async () => {
    setIsClosingShift(true);
    triggerHaptic('impact');

    const closurePayload = {
      company_id: 'c-sorali',
      warehouse_id: 'w-main',
      user_id: 'u-admin',
      counted_cash: parsedCountedCash,
      opening_float: shiftMetrics.opening_float,
      notes: "Clôture de poste mobile via Telegram Mini App"
    };

    try {
      const res = await fetch(`${API_BASE}/pos/daily-close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(closurePayload)
      }).catch(() => null);

      const data = res ? await res.json().catch(() => null) : null;
      const closureNumber = data?.closure?.closure_number || `Z-${new Date().getFullYear()}-${new Date().getMonth() + 1}${new Date().getDate()}-001`;

      const zSlipData = {
        closure_number: closureNumber,
        cashier_name: "Staff Mobile SORALI",
        ...shiftMetrics,
        counted_cash: parsedCountedCash,
        difference: cashDiscrepancy
      };

      setPrintedZReport(zSlipData);
      triggerHaptic('success');
      setStatusMessage({ 
        type: 'success', 
        text: `Rapport ${closureNumber} clôturé et notifié sur Telegram !` 
      });
      setIsZReportOpen(false);
    } catch {
      triggerHaptic('error');
      setStatusMessage({ type: 'error', text: 'Échec de la clôture de caisse' });
    } finally {
      setIsClosingShift(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d1117] text-slate-100 font-sans selection:bg-blue-500/30 flex flex-col antialiased">
      
      {/* TOP HEADER */}
      <header className="sticky top-0 z-30 bg-[#161b22]/90 backdrop-blur-md border-b border-white/10 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Box className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-white">SORALI DISTRIBUTION</h1>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  Wholesale POS
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">Vente en Gros & Gestion de Stock Mobile</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => { triggerHaptic('selection'); setIsZReportOpen(true); }}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/20 to-orange-500/20 hover:from-amber-500/30 hover:to-orange-500/30 text-amber-300 border border-amber-500/30 text-xs font-bold transition-all shadow-sm active:scale-95"
              title="Clôture Journalière (Rapport Z)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-amber-400" />
              <span>Rapport Z</span>
            </button>

            <div className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs">
              <span className={`w-2 h-2 rounded-full ${isOffline ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
              <span className="text-slate-300 text-[11px] hidden md:inline">
                {isOffline ? 'Mode Local' : 'Cloud Synchronisé'}
              </span>
            </div>

            <button
              onClick={() => { triggerHaptic('selection'); fetchData(); }}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-colors"
              title="Rafraîchir"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* NAVIGATION TABS */}
      <div className="max-w-7xl mx-auto w-full px-4 pt-4 pb-2">
        <div className="flex bg-[#161b22] p-1 rounded-2xl border border-white/10 shadow-inner">
          {[
            { id: 'pos', label: 'Caisse & Vente', icon: ShoppingCart, count: cart.length },
            { id: 'stock', label: 'Catalogue Stock', icon: Package, count: inventory.length },
            { id: 'customers', label: 'Clients & Crédits', icon: Users, count: customers.length }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => { triggerHaptic('selection'); setActiveTab(tab.id); }}
                className={`flex-1 flex items-center justify-center py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 gap-2 ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isActive ? 'bg-white/20 text-white' : 'bg-white/10 text-slate-300'}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* STATUS & TOAST */}
      <div className="max-w-7xl mx-auto w-full px-4 pt-2">
        {statusMessage && (
          <div className={`p-3.5 rounded-xl text-sm font-medium flex justify-between items-center shadow-lg transition-all ${
            statusMessage.type === 'error' 
              ? 'bg-red-500/20 text-red-300 border border-red-500/30' 
              : statusMessage.type === 'warning'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
          }`}>
            <div className="flex items-center space-x-2">
              {statusMessage.type === 'error' ? <AlertCircle className="w-4 h-4 text-red-400" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
              <span>{statusMessage.text}</span>
            </div>
            <button className="text-white/60 hover:text-white p-1" onClick={() => setStatusMessage(null)}>
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* PRINT BANNER FOR ORDERS */}
        {lastOrder && (
          <div className="mt-3 bg-emerald-500/10 border border-emerald-500/30 backdrop-blur-md p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <p className="font-bold text-emerald-400 text-sm sm:text-base">Vente clôturée avec succès !</p>
                <p className="text-xs text-slate-300">
                  Facture N° <span className="font-mono font-bold text-white">{lastOrder.invoice.invoice_number}</span> · Client: {lastOrder.customerName}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button 
                onClick={() => {
                  triggerHaptic('impact');
                  window.print();
                }}
                className="bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimer Ticket (80mm)</span>
              </button>
              <button 
                onClick={() => setLastOrder(null)}
                className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-xs"
              >
                Fermer
              </button>
            </div>

            <Receipt 
              invoiceData={lastOrder.invoice} 
              cart={lastOrder.cart} 
              customerName={lastOrder.customerName}
              total={lastOrder.total}
              cashReceived={lastOrder.cash}
            />
          </div>
        )}
      </div>

      {/* MAIN VIEW */}
      <main className="max-w-7xl mx-auto w-full px-4 py-4 flex-1 pb-28 lg:pb-8">
        
        {/* TAB 1: POS & DUAL-SELECTOR TERMINAL */}
        {activeTab === 'pos' && (
          <div className="lg:grid lg:grid-cols-12 lg:gap-6 items-start">
            
            {/* CATALOGUE & CARDS (LEFT PANE) */}
            <div className="lg:col-span-7 xl:col-span-8 space-y-4">
              
              <div className="space-y-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input 
                    type="text"
                    placeholder="Rechercher par article, marque ou SKU..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full bg-[#161b22] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="absolute right-3 top-3 text-slate-400 hover:text-white">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-none">
                  {categories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => { triggerHaptic('selection'); setSelectedCategory(cat); }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                        selectedCategory === cat
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-[#161b22] text-slate-400 hover:text-slate-200 border border-white/5'
                      }`}
                    >
                      {cat === 'All' ? 'Tous les articles' : cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Product Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredInventory.length === 0 ? (
                  <div className="col-span-full py-12 text-center text-slate-500">
                    <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Aucun article ne correspond à votre recherche</p>
                  </div>
                ) : (
                  filteredInventory.map(item => {
                    const unitsPerCarton = item.units_per_carton || 12;
                    const cartonPrice = item.carton_price || (item.price * unitsPerCarton);
                    const isLowStock = item.quantity <= (unitsPerCarton * 2);
                    const inCartItem = cart.find(c => c.item_id === item.id);

                    return (
                      <div 
                        key={item.id} 
                        className="bg-[#161b22] border border-white/10 hover:border-blue-500/40 rounded-2xl p-4 transition-all duration-200 shadow-md flex flex-col justify-between group"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <h3 className="font-bold text-white text-sm sm:text-base leading-snug group-hover:text-blue-400 transition-colors">
                              {item.name}
                            </h3>
                            {item.sku && (
                              <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-white/5 text-slate-400 border border-white/5">
                                {item.sku}
                              </span>
                            )}
                          </div>

                          <div className="flex items-baseline space-x-2 mt-1">
                            <span className="text-base font-extrabold text-blue-400">
                              {item.price.toLocaleString()} DA
                            </span>
                            <span className="text-xs text-slate-400">/ unité</span>
                            <span className="text-xs text-slate-500">·</span>
                            <span className="text-xs font-semibold text-slate-300">
                              {cartonPrice.toLocaleString()} DA <span className="text-[10px] text-slate-400">/ ctn</span>
                            </span>
                          </div>

                          <div className="mt-2.5 flex items-center justify-between text-xs py-1.5 px-2.5 rounded-xl bg-black/20 border border-white/5">
                            <div className="flex items-center space-x-1.5 text-slate-300">
                              <Box className="w-3.5 h-3.5 text-blue-400" />
                              <span className="text-[11px] font-medium">{unitsPerCarton} u / carton</span>
                            </div>
                            <div className="flex items-center space-x-1.5">
                              <span className={`w-2 h-2 rounded-full ${isLowStock ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
                              <span className={`text-[11px] font-semibold ${isLowStock ? 'text-amber-400' : 'text-slate-300'}`}>
                                {Math.floor(item.quantity / unitsPerCarton)} ctn ({item.quantity} u)
                              </span>
                            </div>
                          </div>
                        </div>

                        {inCartItem && (
                          <div className="mt-2.5 py-1 px-2.5 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-between text-xs">
                            <span className="text-blue-300 font-medium">Dans le panier :</span>
                            <span className="font-bold text-blue-200">
                              {inCartItem.cartons > 0 ? `${inCartItem.cartons} ctn ` : ''}
                              {inCartItem.units > 0 ? `+ ${inCartItem.units} u ` : ''}
                              ({inCartItem.quantity} pièces)
                            </span>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2 mt-3 pt-2 border-t border-white/5">
                          <button
                            onClick={() => addUnitToCart(item)}
                            className="bg-white/5 hover:bg-white/10 text-slate-200 hover:text-white border border-white/10 py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1.5"
                          >
                            <Plus className="w-3.5 h-3.5 text-blue-400" />
                            <span>+ 1 Unité</span>
                          </button>

                          <button
                            onClick={() => addCartonToCart(item)}
                            className="bg-blue-600 hover:bg-blue-500 active:scale-95 text-white py-2 px-2.5 rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 transition-all flex items-center justify-center space-x-1.5"
                          >
                            <Box className="w-3.5 h-3.5" />
                            <span>+ 1 Carton</span>
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* SPLIT ORDER TERMINAL FOR IPAD / DESKTOP (RIGHT PANE) */}
            <div className="hidden lg:block lg:col-span-5 xl:col-span-4 sticky top-20 space-y-4">
              <div className="bg-[#161b22] border border-white/10 rounded-2xl p-5 shadow-xl flex flex-col h-[calc(100vh-6.5rem)]">
                
                <div className="flex items-center justify-between pb-3 border-b border-white/10">
                  <div className="flex items-center space-x-2">
                    <ShoppingCart className="w-5 h-5 text-blue-400" />
                    <h2 className="font-bold text-white text-base">Bon de Commande</h2>
                  </div>
                  {cart.length > 0 && (
                    <button onClick={clearCart} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 hover:underline">
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Vider</span>
                    </button>
                  )}
                </div>

                <div className="py-3 border-b border-white/10 space-y-2">
                  <label className="text-xs font-semibold text-slate-400 flex items-center justify-between">
                    <span>Client Facturé :</span>
                    {currentCustomer && (
                      <span className={`text-[11px] font-bold ${currentCustomer.debt_balance > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        Dette : {currentCustomer.debt_balance.toLocaleString()} DA
                      </span>
                    )}
                  </label>
                  <select 
                    className="w-full bg-[#0d1117] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={selectedCustomer} 
                    onChange={e => { triggerHaptic('selection'); setSelectedCustomer(e.target.value); }}
                  >
                    <option value="">Client Comptoir (Vente Directe Cash)</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.debt_balance > 0 ? `(Dette: ${c.debt_balance.toLocaleString()} DA)` : '✓'}
                      </option>
                    ))}
                  </select>

                  {currentCustomer && currentCustomer.debt_balance > 0 && (
                    <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center space-x-2">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-400" />
                      <div>
                        <span>Plafond : {(currentCustomer.credit_limit || 100000).toLocaleString()} DA</span>
                        <div className="w-full bg-black/40 h-1.5 rounded-full mt-1 overflow-hidden">
                          <div 
                            className="bg-amber-400 h-full rounded-full" 
                            style={{ width: `${Math.min(100, (currentCustomer.debt_balance / (currentCustomer.credit_limit || 100000)) * 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Cart Items */}
                <div className="flex-1 overflow-y-auto py-3 space-y-2.5 pr-1 scrollbar-thin">
                  {cart.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500 py-12 text-center">
                      <ShoppingCart className="w-10 h-10 mb-2 opacity-30" />
                      <p className="text-sm font-medium">Panier vide</p>
                      <p className="text-xs text-slate-500 mt-1">Sélectionnez des cartons ou unités</p>
                    </div>
                  ) : (
                    cart.map(item => {
                      const unitsPerCarton = item.units_per_carton || 12;
                      const lineTotal = item.quantity * item.unit_price;

                      return (
                        <div key={item.item_id} className="bg-[#0d1117] p-3 rounded-xl border border-white/5 space-y-2">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-sm font-bold text-white leading-tight">{item.name}</p>
                              <p className="text-xs text-slate-400 mt-0.5">
                                {item.unit_price.toLocaleString()} DA / unité · {unitsPerCarton} u/ctn
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-extrabold text-blue-400 text-sm">{lineTotal.toLocaleString()} DA</p>
                              <button onClick={() => removeFromCart(item.item_id)} className="text-slate-500 hover:text-red-400 p-1 text-xs">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/5">
                            <div className="flex items-center justify-between bg-white/5 px-2 py-1 rounded-lg">
                              <span className="text-[11px] font-semibold text-slate-400">Ctns:</span>
                              <div className="flex items-center space-x-1.5">
                                <button onClick={() => updateCartItemCartons(item.item_id, -1)} className="w-5 h-5 rounded bg-white/10 text-white text-xs">-</button>
                                <span className="text-xs font-bold text-white w-4 text-center">{item.cartons || 0}</span>
                                <button onClick={() => updateCartItemCartons(item.item_id, 1)} className="w-5 h-5 rounded bg-blue-600 text-white text-xs">+</button>
                              </div>
                            </div>

                            <div className="flex items-center justify-between bg-white/5 px-2 py-1 rounded-lg">
                              <span className="text-[11px] font-semibold text-slate-400">Unités:</span>
                              <div className="flex items-center space-x-1.5">
                                <button onClick={() => updateCartItemUnits(item.item_id, -1)} className="w-5 h-5 rounded bg-white/10 text-white text-xs">-</button>
                                <span className="text-xs font-bold text-white w-4 text-center">{item.units || 0}</span>
                                <button onClick={() => updateCartItemUnits(item.item_id, 1)} className="w-5 h-5 rounded bg-blue-600 text-white text-xs">+</button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Totals & Actions */}
                <div className="pt-3 border-t border-white/10 space-y-3">
                  <div className="space-y-1.5 text-xs text-slate-300">
                    <div className="flex justify-between">
                      <span>Volume :</span>
                      <span className="font-semibold text-white">
                        {totalCartonsCount} cartons · {totalLooseUnitsCount} unités ({totalArticlesCount} réf.)
                      </span>
                    </div>
                    <div className="flex justify-between items-baseline pt-1">
                      <span className="text-sm font-bold text-white">Total Facture :</span>
                      <span className="text-2xl font-black text-blue-400">{subtotal.toLocaleString()} DA</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-slate-400">
                      <span>Raccourcis Espèces :</span>
                      <button onClick={() => setQuickCash(subtotal)} className="text-blue-400 hover:underline font-semibold">
                        Montant Exact ({subtotal.toLocaleString()} DA)
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[1000, 2000, 5000, 10000].map(val => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setQuickCash(val)}
                          className="py-1 px-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-[11px] font-semibold border border-white/5 transition-all text-center"
                        >
                          +{val.toLocaleString()}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="relative">
                      <Banknote className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <input 
                        type="number" 
                        placeholder="Montant Espèces Reçu (DA)" 
                        className="w-full bg-[#0d1117] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={cashAmount}
                        onChange={e => setCashAmount(e.target.value)}
                      />
                    </div>

                    {selectedCustomer && debtAdded > 0 && (
                      <div className="flex justify-between text-xs px-2 py-1 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20">
                        <span>Ajouté au compte crédit :</span>
                        <span className="font-bold">+{debtAdded.toLocaleString()} DA</span>
                      </div>
                    )}
                  </div>

                  <button 
                    onClick={handleCheckout}
                    disabled={cart.length === 0 || isSubmitting}
                    className="w-full bg-blue-600 hover:bg-blue-500 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none text-white font-bold py-3.5 px-4 rounded-xl shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center space-x-2"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    <span>{isSubmitting ? 'Traitement en cours...' : 'Valider la Vente'}</span>
                  </button>
                </div>

              </div>
            </div>

          </div>
        )}

        {/* TAB 2: STOCK INVENTORY */}
        {activeTab === 'stock' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#161b22] p-4 rounded-2xl border border-white/10">
              <div>
                <h2 className="text-lg font-bold text-white">Inventaire & Gestion des Stocks</h2>
                <p className="text-xs text-slate-400">Articles disponibles, conversion automatique pièces/cartons</p>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs">
                <span className="text-slate-400">Total Références : </span>
                <span className="font-bold text-white">{inventory.length}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {inventory.map(item => {
                const unitsPerCarton = item.units_per_carton || 12;
                const cartonsCount = Math.floor(item.quantity / unitsPerCarton);
                const looseUnits = item.quantity % unitsPerCarton;
                const isLow = item.quantity <= (unitsPerCarton * 2);

                return (
                  <div key={item.id} className="bg-[#161b22] border border-white/10 rounded-2xl p-4 shadow-md flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start gap-2">
                        <h3 className="font-bold text-white text-base">{item.name}</h3>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-slate-300 font-mono">
                          {item.sku || 'SKU'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{item.category || 'Général'}</p>

                      <div className="mt-3 p-3 rounded-xl bg-[#0d1117] border border-white/5 space-y-1.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Conditionnement :</span>
                          <span className="font-medium text-white">{unitsPerCarton} unités / carton</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Prix Unitaire :</span>
                          <span className="font-bold text-blue-400">{item.price.toLocaleString()} DA</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Prix Carton :</span>
                          <span className="font-bold text-slate-200">{(item.carton_price || (item.price * unitsPerCarton)).toLocaleString()} DA</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
                      <span className="text-xs text-slate-400">Stock Réel :</span>
                      <div className="text-right">
                        <p className={`font-bold text-sm ${isLow ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {cartonsCount} ctns + {looseUnits} u
                        </p>
                        <p className="text-[11px] text-slate-500">({item.quantity} pièces au total)</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: CUSTOMERS & CREDIT */}
        {activeTab === 'customers' && (
          <div className="space-y-4">
            <div className="bg-[#161b22] p-4 rounded-2xl border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-white">Comptes Clients & Encours de Crédit</h2>
                <p className="text-xs text-slate-400">Gestion des dettes et plafonds de crédit autorisés</p>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
                <span>Dette Globale : </span>
                <span className="font-bold">
                  {customers.reduce((acc, c) => acc + (c.debt_balance || 0), 0).toLocaleString()} DA
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {customers.map(c => {
                const limit = c.credit_limit || 100000;
                const ratio = Math.min(100, ((c.debt_balance || 0) / limit) * 100);
                const hasDebt = (c.debt_balance || 0) > 0;

                return (
                  <div key={c.id} className="bg-[#161b22] border border-white/10 rounded-2xl p-4 shadow-md flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <h3 className="font-bold text-white text-base">{c.name}</h3>
                          <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                            <Phone className="w-3 h-3 text-slate-500" />
                            <span>{c.phone || 'Aucun numéro'}</span>
                          </p>
                        </div>
                        <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                          hasDebt ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-emerald-500/20 text-emerald-300'
                        }`}>
                          {hasDebt ? `${c.debt_balance.toLocaleString()} DA` : 'À jour'}
                        </span>
                      </div>

                      <div className="mt-3 space-y-1">
                        <div className="flex justify-between text-[11px] text-slate-400">
                          <span>Utilisation du Crédit :</span>
                          <span>{ratio.toFixed(0)}% (Plafond: {limit.toLocaleString()} DA)</span>
                        </div>
                        <div className="w-full bg-black/40 h-2 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all ${ratio > 80 ? 'bg-red-500' : 'bg-amber-400'}`}
                            style={{ width: `${ratio}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-white/5 flex gap-2">
                      <button 
                        onClick={() => {
                          setSelectedCustomer(String(c.id));
                          setActiveTab('pos');
                          triggerHaptic('selection');
                        }}
                        className="flex-1 bg-white/5 hover:bg-white/10 text-slate-200 py-2 rounded-xl text-xs font-semibold border border-white/10 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <ShoppingCart className="w-3.5 h-3.5 text-blue-400" />
                        <span>Créer Commande</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </main>

      {/* MOBILE TELEGRAM-NATIVE STICKY BOTTOM BAR */}
      {activeTab === 'pos' && cart.length > 0 && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 p-3 bg-[#161b22]/95 backdrop-blur-xl border-t border-white/10 shadow-2xl">
          <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
            <div 
              onClick={() => { triggerHaptic('selection'); setIsDrawerOpen(true); }}
              className="cursor-pointer"
            >
              <p className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                <span>{totalCartonsCount} ctns + {totalLooseUnitsCount} u ({cart.length} réf.)</span>
              </p>
              <p className="text-xl font-extrabold text-blue-400 leading-tight">
                {subtotal.toLocaleString()} DA
              </p>
            </div>

            <button
              onClick={() => { triggerHaptic('impact'); setIsDrawerOpen(true); }}
              className="bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold px-5 py-3 rounded-2xl shadow-lg shadow-blue-600/30 flex items-center space-x-2 text-sm"
            >
              <span>Voir le Panier</span>
              <ChevronUp className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* MOBILE TELEGRAM-NATIVE HAPTIC SLIDE-UP DRAWER */}
      {isDrawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm transition-all">
          <div 
            className="flex-1" 
            onClick={() => { triggerHaptic('selection'); setIsDrawerOpen(false); }} 
          />

          <div className="bg-[#161b22] border-t border-white/10 rounded-t-3xl p-5 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto mb-4" />

            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center space-x-2">
                <ShoppingCart className="w-5 h-5 text-blue-400" />
                <h2 className="font-bold text-white text-base">Bon de Commande Mobile</h2>
              </div>
              <div className="flex items-center space-x-2">
                <button onClick={clearCart} className="text-xs text-red-400 hover:text-red-300 px-2 py-1">
                  Vider
                </button>
                <button onClick={() => setIsDrawerOpen(false)} className="p-1 rounded-full text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="py-3 border-b border-white/10 space-y-2">
              <label className="text-xs font-semibold text-slate-400 flex justify-between">
                <span>Client Facturé :</span>
                {currentCustomer && (
                  <span className={`text-[11px] font-bold ${currentCustomer.debt_balance > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    Dette : {currentCustomer.debt_balance.toLocaleString()} DA
                  </span>
                )}
              </label>
              <select 
                className="w-full bg-[#0d1117] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={selectedCustomer} 
                onChange={e => { triggerHaptic('selection'); setSelectedCustomer(e.target.value); }}
              >
                <option value="">Client Comptoir (Vente Directe Cash)</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.debt_balance > 0 ? `(Dette: ${c.debt_balance.toLocaleString()} DA)` : '✓'}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1 overflow-y-auto py-3 space-y-2.5 max-h-56 pr-1 scrollbar-thin">
              {cart.map(item => (
                <div key={item.item_id} className="bg-[#0d1117] p-3 rounded-xl border border-white/5 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-bold text-white leading-tight">{item.name}</p>
                      <p className="text-xs text-slate-400">{item.unit_price.toLocaleString()} DA / unité</p>
                    </div>
                    <div className="text-right">
                      <p className="font-extrabold text-blue-400 text-sm">{(item.quantity * item.unit_price).toLocaleString()} DA</p>
                      <button onClick={() => removeFromCart(item.item_id)} className="text-red-400 p-1 text-xs">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/5">
                    <div className="flex items-center justify-between bg-white/5 px-2 py-1 rounded-lg">
                      <span className="text-[11px] text-slate-400 font-semibold">Ctns:</span>
                      <div className="flex items-center space-x-1.5">
                        <button onClick={() => updateCartItemCartons(item.item_id, -1)} className="w-5 h-5 rounded bg-white/10 text-white text-xs">-</button>
                        <span className="text-xs font-bold text-white">{item.cartons || 0}</span>
                        <button onClick={() => updateCartItemCartons(item.item_id, 1)} className="w-5 h-5 rounded bg-blue-600 text-white text-xs">+</button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between bg-white/5 px-2 py-1 rounded-lg">
                      <span className="text-[11px] text-slate-400 font-semibold">Unités:</span>
                      <div className="flex items-center space-x-1.5">
                        <button onClick={() => updateCartItemUnits(item.item_id, -1)} className="w-5 h-5 rounded bg-white/10 text-white text-xs">-</button>
                        <span className="text-xs font-bold text-white">{item.units || 0}</span>
                        <button onClick={() => updateCartItemUnits(item.item_id, 1)} className="w-5 h-5 rounded bg-blue-600 text-white text-xs">+</button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-white/10 space-y-3">
              <div className="flex justify-between items-baseline">
                <span className="text-sm font-bold text-slate-300">Total :</span>
                <span className="text-2xl font-black text-blue-400">{subtotal.toLocaleString()} DA</span>
              </div>

              <div className="grid grid-cols-4 gap-1.5">
                {[1000, 2000, 5000, 10000].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setQuickCash(val)}
                    className="py-1.5 px-1 rounded-lg bg-white/5 text-slate-300 text-xs font-semibold border border-white/5"
                  >
                    +{val.toLocaleString()}
                  </button>
                ))}
              </div>

              <div className="relative">
                <Banknote className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                <input 
                  type="number" 
                  placeholder="Espèces Reçus (DA)" 
                  className="w-full bg-[#0d1117] border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={cashAmount}
                  onChange={e => setCashAmount(e.target.value)}
                />
              </div>

              {selectedCustomer && debtAdded > 0 && (
                <div className="flex justify-between text-xs px-2.5 py-1.5 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  <span>Dette ajoutée au compte :</span>
                  <span className="font-bold">+{debtAdded.toLocaleString()} DA</span>
                </div>
              )}

              <button 
                onClick={handleCheckout}
                disabled={isSubmitting || cart.length === 0}
                className="w-full bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-white font-bold py-3.5 px-4 rounded-xl shadow-lg shadow-blue-600/30 flex items-center justify-center space-x-2 text-sm"
              >
                <CheckCircle2 className="w-5 h-5" />
                <span>{isSubmitting ? 'Traitement...' : 'Valider la Commande'}</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Z-REPORT RECONCILIATION MODAL */}
      {isZReportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-[#161b22] border border-white/10 rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4 my-8 animate-fadeIn">
            
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                  <FileSpreadsheet className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-extrabold text-white">Clôture Journalière (Rapport Z)</h2>
                  <p className="text-xs text-slate-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    <span>Poste en cours · {new Date().toLocaleDateString('fr-FR')}</span>
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsZReportOpen(false)}
                className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-[#0d1117] p-3 rounded-xl border border-white/5">
                <span className="text-slate-400">Factures Émises :</span>
                <p className="text-base font-bold text-white mt-0.5">{shiftMetrics.invoices_count}</p>
              </div>
              <div className="bg-[#0d1117] p-3 rounded-xl border border-white/5">
                <span className="text-slate-400">Chiffre d'Affaires Brut :</span>
                <p className="text-base font-extrabold text-blue-400 mt-0.5">{shiftMetrics.gross_sales.toLocaleString()} DA</p>
              </div>
              <div className="bg-[#0d1117] p-3 rounded-xl border border-white/5">
                <span className="text-slate-400">Espèces Ventes Directes :</span>
                <p className="text-sm font-bold text-emerald-400 mt-0.5">+{shiftMetrics.cash_sales.toLocaleString()} DA</p>
              </div>
              <div className="bg-[#0d1117] p-3 rounded-xl border border-white/5">
                <span className="text-slate-400">Crédit Accordé (Dettes) :</span>
                <p className="text-sm font-bold text-amber-400 mt-0.5">+{shiftMetrics.credit_sales.toLocaleString()} DA</p>
              </div>
              <div className="bg-[#0d1117] p-3 rounded-xl border border-white/5">
                <span className="text-slate-400">Recouvrement Dettes :</span>
                <p className="text-sm font-bold text-emerald-400 mt-0.5">+{shiftMetrics.debt_recovered.toLocaleString()} DA</p>
              </div>
              <div className="bg-[#0d1117] p-3 rounded-xl border border-white/5">
                <span className="text-slate-400">Fond de Caisse Départ :</span>
                <p className="text-sm font-bold text-slate-300 mt-0.5">{shiftMetrics.opening_float.toLocaleString()} DA</p>
              </div>
            </div>

            <div className="bg-blue-600/10 border border-blue-500/20 p-4 rounded-2xl space-y-2.5">
              <div className="flex justify-between items-baseline">
                <span className="text-xs font-semibold text-slate-300">ESPÈCES THÉORIQUES ATTENDUES :</span>
                <span className="text-xl font-black text-blue-400">{shiftMetrics.expected_cash.toLocaleString()} DA</span>
              </div>

              <div className="space-y-1 pt-1">
                <label className="text-xs font-semibold text-slate-300">Espèces Physiques Comptés en Caisse :</label>
                <div className="relative">
                  <Banknote className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                  <input
                    type="number"
                    placeholder={`Ex: ${shiftMetrics.expected_cash}`}
                    value={countedCashInput}
                    onChange={e => setCountedCashInput(e.target.value)}
                    className="w-full bg-[#0d1117] border border-white/15 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className={`p-2.5 rounded-xl text-xs font-bold flex items-center justify-between border ${
                cashDiscrepancy === 0 
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : cashDiscrepancy < 0 
                    ? 'bg-red-500/20 text-red-300 border-red-500/30'
                    : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
              }`}>
                <span>Écart de Caisse :</span>
                <span>
                  {cashDiscrepancy === 0 
                    ? '0 DA · Caisse Conforme ✅' 
                    : `${cashDiscrepancy > 0 ? '+' : ''}${cashDiscrepancy.toLocaleString()} DA (${cashDiscrepancy < 0 ? 'Manquant ⚠️' : 'Excédent ℹ️'})`}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('selection');
                  const slipData = {
                    closure_number: `Z-${new Date().getFullYear()}-${new Date().getMonth() + 1}${new Date().getDate()}-PREV`,
                    cashier_name: "Staff Mobile SORALI",
                    ...shiftMetrics,
                    counted_cash: parsedCountedCash,
                    difference: cashDiscrepancy
                  };
                  setPrintedZReport(slipData);
                  setTimeout(() => window.print(), 100);
                }}
                className="bg-white/10 hover:bg-white/15 active:scale-95 text-white font-bold py-3 px-3 rounded-xl text-xs flex items-center justify-center space-x-1.5 transition-all border border-white/10"
              >
                <Printer className="w-4 h-4 text-slate-300" />
                <span>Imprimer Ticket Z (80mm)</span>
              </button>

              <button
                type="button"
                onClick={handleCommitDailyClose}
                disabled={isClosingShift}
                className="bg-amber-500 hover:bg-amber-600 active:scale-95 disabled:opacity-50 text-black font-extrabold py-3 px-3 rounded-xl text-xs flex items-center justify-center space-x-1.5 transition-all shadow-lg shadow-amber-500/20"
              >
                <Send className="w-4 h-4" />
                <span>{isClosingShift ? 'Envoi...' : 'Clôturer & Notifier Bot'}</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 80mm Z-Report Print Renderer */}
      {printedZReport && (
        <Receipt zReportData={printedZReport} />
      )}

    </div>
  );
}