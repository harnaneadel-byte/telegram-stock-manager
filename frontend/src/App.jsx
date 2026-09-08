import Receipt from './components/Receipt';
import React, { useState, useEffect } from 'react';
import { ShoppingCart, Package, Users, BarChart3, Trash2, CheckCircle, AlertCircle } from 'lucide-react';

const API_BASE = "https://telegram-stock-manager.onrender.com/api/cloud";
const COMPANY_ID = "d7d6d1a9-f4db-4214-874d-d8267b3dfde5";
const WAREHOUSE_ID = "f465ed15-ffe9-4e75-ac8c-7fb4ad0e6672";
const USER_ID = "1e495e0a-e468-4bba-a989-576321ae74a1";

export default function App() {
  const [activeTab, setActiveTab] = useState('pos');
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [cart, setCart] = useState([]);
  const [cashAmount, setCashAmount] = useState('');
const [lastOrder, setLastOrder] = useState(null);
  const [summary, setSummary] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);

  // Load initial catalog & data
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const prodRes = await fetch(`${API_BASE}/products?company_id=${COMPANY_ID}&warehouse_id=${WAREHOUSE_ID}`);
      const prodData = await prodRes.json();
      if (prodData.success) setProducts(prodData.products);

      const custRes = await fetch(`${API_BASE}/customers?company_id=${COMPANY_ID}`);
      const custData = await custRes.json();
      if (custData.success) {
        setCustomers(custData.customers);
        if (custData.customers.length > 0) setSelectedCustomer(custData.customers[0].customer_id);
      }

      const sumRes = await fetch(`${API_BASE}/reports/summary?company_id=${COMPANY_ID}&warehouse_id=${WAREHOUSE_ID}`);
      const sumData = await sumRes.json();
      if (sumData.success) setSummary(sumData.summary);
    } catch (err) {
      console.error("Failed to load dashboard data:", err);
    }
  };

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(item => item.product_id === product.product_id);
      if (existing) {
        return prev.map(item => 
          item.product_id === product.product_id 
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { 
        product_id: product.product_id, 
        name: product.name, 
        unit_price: product.wholesale_price || 450, 
        quantity: 1,
        discount_percent: 0 
      }];
    });
  };

  const updateCartQty = (product_id, qty) => {
    if (qty <= 0) {
      setCart(prev => prev.filter(item => item.product_id !== product_id));
    } else {
      setCart(prev => prev.map(item => item.product_id === product_id ? { ...item, quantity: qty } : item));
    }
  };

  const calculateSubtotal = () => cart.reduce((acc, item) => acc + (item.quantity * item.unit_price), acc);

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setStatusMessage(null);

    try {
      const payload = {
        company_id: COMPANY_ID,
        warehouse_id: WAREHOUSE_ID,
        customer_id: selectedCustomer || null,
        user_id: USER_ID,
        items: cart.map(i => ({
          product_id: i.product_id,
          quantity_units: i.quantity,
          unit_price: i.unit_price,
          discount_percent: i.discount_percent
        })),
        payments: cashAmount ? [{ method: 'cash', amount: parseFloat(cashAmount) }] : [],
        notes: "Mini App POS Checkout"
      };

      const res = await fetch(`${API_BASE}/pos/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
  setStatusMessage({ type: 'success', text: `Invoice ${data.invoice.invoice_number} completed!` });
  // Save order details for printing
  setLastOrder({
    invoice: data.invoice,
    cart: [...cart],
    customerName: customers.find(c => c.customer_id === selectedCustomer)?.name,
    total: calculateSubtotal(),
    cash: cashAmount
  });

  setCart([]);
  setCashAmount('');
  fetchData();
}
 else {
        setStatusMessage({ type: 'error', text: data.error || "Checkout failed" });
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: "Network error during checkout" });
    }
  };

  return (
    <div className="min-h-screen pb-20 bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Header */}
      <header className="bg-indigo-600 text-white px-4 py-3 shadow-md flex justify-between items-center">
        <div>
          <h1 className="font-bold text-lg">SORALI POS & Inventory</h1>
          <p className="text-xs text-indigo-200">Main Warehouse • Cloud Node</p>
        </div>
        <div className="text-xs bg-indigo-700 px-2 py-1 rounded">Online</div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-4 max-w-4xl mx-auto w-full">
        {statusMessage && (
          <div className={`p-3 mb-4 rounded-lg text-sm flex items-center gap-2 ${statusMessage.type === 'success' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
            {statusMessage.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
            <span>{statusMessage.text}</span>
          </div>
        )}
{lastOrder && (
  <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl mb-4 flex justify-between items-center">
    <div>
      <p className="font-bold text-emerald-800">Checkout Complete!</p>
      <p className="text-xs text-emerald-600">Invoice {lastOrder.invoice.invoice_number}</p>
    </div>
    <button 
      onClick={() => window.print()}
      className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
    >
      🖨️ Print Receipt
    </button>

    {/* The hidden receipt component */}
    <Receipt 
      invoiceData={lastOrder.invoice} 
      cart={lastOrder.cart} 
      customerName={lastOrder.customerName}
      total={lastOrder.total}
      cashReceived={lastOrder.cash}
    />
  </div>
)}
        {/* TAB 1: POS CHECKOUT */}
        {activeTab === 'pos' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Catalog list */}
            <div>
              <h2 className="font-semibold mb-3 text-slate-700">Product Catalog</h2>
              <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                {products.map(p => (
                  <div key={p.product_id} className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center">
                    <div>
                      <p className="font-medium text-sm">{p.name}</p>
                      <p className="text-xs text-slate-500">Stock: <span className="font-semibold text-slate-700">{p.quantity_units} units</span> ({p.cartons} cartons)</p>
                    </div>
                    <div className="text-right">
                      <p className="text-indigo-600 font-bold text-sm">{p.wholesale_price || 450} DA</p>
                      <button 
                        onClick={() => addToCart(p)}
                        className="mt-1 bg-indigo-50 text-indigo-600 text-xs px-3 py-1 rounded-lg font-medium hover:bg-indigo-600 hover:text-white transition"
                      >
                        + Add
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Cart & Checkout */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
              <div>
                <h2 className="font-semibold mb-3 text-slate-700">Current Cart</h2>
                <div className="mb-3">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Customer Account</label>
                  <select 
                    value={selectedCustomer} 
                    onChange={e => setSelectedCustomer(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded-lg p-2 bg-slate-50"
                  >
                    {customers.map(c => (
                      <option key={c.customer_id} value={c.customer_id}>{c.name} (Balance: {c.balance} DA)</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2 max-h-[35vh] overflow-y-auto mb-4">
                  {cart.length === 0 ? (
                    <p className="text-center text-slate-400 text-sm py-8">Cart is empty. Tap items to add.</p>
                  ) : (
                    cart.map(item => (
                      <div key={item.product_id} className="flex justify-between items-center text-sm border-b pb-2">
                        <div>
                          <p className="font-medium">{item.name}</p>
                          <p className="text-xs text-slate-500">{item.unit_price} DA × {item.quantity}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <input 
                            type="number" 
                            value={item.quantity} 
                            onChange={e => updateCartQty(item.product_id, parseInt(e.target.value) || 0)}
                            className="w-14 text-center border rounded p-1 text-sm"
                          />
                          <button onClick={() => updateCartQty(item.product_id, 0)} className="text-rose-500 hover:text-rose-700">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <div className="mb-3">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Cash Payment Deposit (DA)</label>
                  <input 
                    type="number" 
                    placeholder="Enter cash received..."
                    value={cashAmount} 
                    onChange={e => setCashAmount(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                  />
                </div>
                <button 
                  onClick={handleCheckout}
                  disabled={cart.length === 0}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-medium py-3 rounded-xl transition shadow-sm text-sm"
                >
                  Complete Checkout
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: INVENTORY */}
        {activeTab === 'inventory' && (
          <div>
            <h2 className="font-semibold mb-3 text-slate-700">Warehouse Stock Status</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {products.map(p => (
                <div key={p.product_id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                  <h3 className="font-semibold text-slate-800">{p.name}</h3>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <div className="bg-slate-50 p-2 rounded">Units: <span className="font-bold text-slate-900">{p.quantity_units}</span></div>
                    <div className="bg-slate-50 p-2 rounded">Cartons: <span className="font-bold text-slate-900">{p.cartons}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: CUSTOMERS & LEDGER */}
        {activeTab === 'customers' && (
          <div>
            <h2 className="font-semibold mb-3 text-slate-700">Customer Debt Balances</h2>
            <div className="space-y-3">
              {customers.map(c => (
                <div key={c.customer_id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center">
                  <div>
                    <h3 className="font-semibold text-slate-800">{c.name}</h3>
                    <p className="text-xs text-slate-500">Account Status: Active</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Current Balance</p>
                    <p className="font-bold text-indigo-600">{c.balance} DA</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: REPORTS */}
        {activeTab === 'reports' && summary && (
          <div>
            <h2 className="font-semibold mb-3 text-slate-700">Executive Summary</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                <p className="text-xs text-slate-500">Total Revenue</p>
                <p className="text-lg font-bold text-indigo-600">{summary.total_revenue} DA</p>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                <p className="text-xs text-slate-500">Total Invoices</p>
                <p className="text-lg font-bold text-slate-800">{summary.total_invoices}</p>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                <p className="text-xs text-slate-500">Outstanding Debt</p>
                <p className="text-lg font-bold text-rose-600">{summary.total_outstanding_debt} DA</p>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                <p className="text-xs text-slate-500">Total Stock Units</p>
                <p className="text-lg font-bold text-slate-800">{summary.total_units_in_stock}</p>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                <p className="text-xs text-slate-500">Low Stock Alerts</p>
                <p className="text-lg font-bold text-amber-600">{summary.low_stock_alerts}</p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-lg px-6 py-2 flex justify-around">
        <button onClick={() => setActiveTab('pos')} className={`flex flex-col items-center gap-1 text-xs font-medium ${activeTab === 'pos' ? 'text-indigo-600' : 'text-slate-400'}`}>
          <ShoppingCart size={20} />
          <span>POS</span>
        </button>
        <button onClick={() => setActiveTab('inventory')} className={`flex flex-col items-center gap-1 text-xs font-medium ${activeTab === 'inventory' ? 'text-indigo-600' : 'text-slate-400'}`}>
          <Package size={20} />
          <span>Inventory</span>
        </button>
        <button onClick={() => setActiveTab('customers')} className={`flex flex-col items-center gap-1 text-xs font-medium ${activeTab === 'customers' ? 'text-indigo-600' : 'text-slate-400'}`}>
          <Users size={20} />
          <span>Customers</span>
        </button>
        <button onClick={() => setActiveTab('reports')} className={`flex flex-col items-center gap-1 text-xs font-medium ${activeTab === 'reports' ? 'text-indigo-600' : 'text-slate-400'}`}>
          <BarChart3 size={20} />
          <span>Reports</span>
        </button>
      </nav>
    </div>
  );
}