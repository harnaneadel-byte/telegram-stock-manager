import React, { useState, useEffect } from 'react';
import Receipt from './components/Receipt';

// Your live Render Backend API
const API_BASE = "https://telegram-stock-manager.onrender.com/api/cloud";

export default function App() {
  const [activeTab, setActiveTab] = useState('pos');
  const [inventory, setInventory] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [cart, setCart] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [cashAmount, setCashAmount] = useState('');
  const [statusMessage, setStatusMessage] = useState(null);
  const [lastOrder, setLastOrder] = useState(null);

  // Fetch initial data
  const fetchData = async () => {
    try {
      const invRes = await fetch(`${API_BASE}/inventory`);
      const invData = await invRes.json();
      setInventory(invData);

      const custRes = await fetch(`${API_BASE}/customers`);
      const custData = await custRes.json();
      setCustomers(custData);
    } catch (error) {
      setStatusMessage({ type: 'error', text: 'Failed to connect to server' });
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Cart Functions
  const addToCart = (item) => {
    const existing = cart.find(c => c.item_id === item.id);
    if (existing) {
      setCart(cart.map(c => c.item_id === item.id ? { ...c, quantity: c.quantity + 1 } : c));
    } else {
      setCart([...cart, { item_id: item.id, name: item.name, quantity: 1, unit_price: item.price }]);
    }
  };

  const removeFromCart = (itemId) => {
    setCart(cart.filter(c => c.item_id !== itemId));
  };

  const calculateSubtotal = () => cart.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

  // Checkout Function
  const handleCheckout = async () => {
    if (cart.length === 0) return setStatusMessage({ type: 'error', text: 'Cart is empty!' });
    
    const payload = {
      customer_id: selectedCustomer || null,
      items: cart,
      cash_received: cashAmount ? parseFloat(cashAmount) : 0
    };

    try {
      const res = await fetch(`${API_BASE}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        // Save order for receipt printing BEFORE clearing cart
        setLastOrder({
          invoice: data.invoice,
          cart: [...cart],
          customerName: customers.find(c => c.id === selectedCustomer)?.name || 'Walk-in',
          total: calculateSubtotal(),
          cash: cashAmount ? parseFloat(cashAmount) : 0
        });

        setStatusMessage({ type: 'success', text: `Invoice ${data.invoice.invoice_number} completed!` });
        setCart([]);
        setCashAmount('');
        setSelectedCustomer('');
        fetchData(); // Refresh stock and debts
      } else {
        setStatusMessage({ type: 'error', text: data.error || 'Checkout failed' });
      }
    } catch (error) {
      setStatusMessage({ type: 'error', text: 'Checkout request failed' });
    }
  };

  return (
    <div className="min-h-screen bg-[#1c1c1d] text-slate-100 p-3 sm:p-4 pb-24 font-sans selection:bg-blue-500/30">
      
      {/* Header */}
      <h1 className="text-2xl font-bold text-center mb-6 text-white tracking-tight pt-2">SORALI POS</h1>

      {/* Glassmorphism Navigation Tabs */}
      <div className="flex space-x-2 mb-6 bg-black/20 p-1.5 rounded-2xl backdrop-blur-md overflow-x-auto border border-white/5 shadow-inner">
        {['POS', 'Stock', 'Customers'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab.toLowerCase())}
            className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all duration-200 whitespace-nowrap ${
              activeTab === tab.toLowerCase()
                ? 'bg-blue-500 text-white shadow-md scale-[1.02]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Status Notifications */}
      {statusMessage && (
        <div className={`p-4 rounded-xl mb-4 text-sm font-medium flex justify-between items-center shadow-lg ${statusMessage.type === 'error' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>
          {statusMessage.text}
          <button className="text-white/50 hover:text-white text-lg p-1" onClick={() => setStatusMessage(null)}>✕</button>
        </div>
      )}

      {/* Thermal Print Success Banner */}
      {lastOrder && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 backdrop-blur-md p-4 rounded-2xl mb-6 flex justify-between items-center shadow-lg">
          <div>
            <p className="font-bold text-emerald-400">Checkout Complete!</p>
            <p className="text-xs text-emerald-500/80">Invoice {lastOrder.invoice.invoice_number}</p>
          </div>
          <button 
            onClick={() => window.print()}
            className="bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2"
          >
            <span>🖨️</span> Print
          </button>
          
          <Receipt 
            invoiceData={lastOrder.invoice} 
            cart={lastOrder.cart} 
            customerName={lastOrder.customerName}
            total={lastOrder.total}
            cashReceived={lastOrder.cash}
          />
        </div>
      )}

      {/* TAB 1: POS SYSTEM */}
      {activeTab === 'pos' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Products List */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2 ml-1">Products</h2>
            {inventory.map(item => (
              <div key={item.id} className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-lg flex justify-between items-center hover:bg-white/10 transition-colors">
                <div>
                  <h3 className="font-bold text-white text-lg">{item.name}</h3>
                  <p className="text-blue-400 font-medium">{item.price} DA</p>
                  <p className="text-xs text-slate-400 mt-1">Stock: {item.quantity}</p>
                </div>
                <button 
                  onClick={() => addToCart(item)}
                  className="bg-white/10 hover:bg-blue-500 active:bg-blue-600 text-white rounded-xl w-12 h-12 flex items-center justify-center text-xl font-bold transition-all"
                >
                  +
                </button>
              </div>
            ))}
          </div>

          {/* Cart & Checkout */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-lg h-fit">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Current Order</h2>
            
            {cart.length === 0 ? (
              <p className="text-center text-slate-500 py-6 italic">Cart is empty</p>
            ) : (
              <div className="space-y-3 mb-6">
                {cart.map(item => (
                  <div key={item.item_id} className="flex justify-between items-center bg-black/20 p-3 rounded-xl border border-white/5">
                    <div>
                      <p className="text-white font-medium">{item.name}</p>
                      <p className="text-xs text-slate-400">{item.quantity} x {item.unit_price} DA</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <p className="font-bold text-blue-400">{item.quantity * item.unit_price} DA</p>
                      <button onClick={() => removeFromCart(item.item_id)} className="text-red-400 hover:text-red-300 p-2 bg-red-400/10 rounded-lg text-sm">
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
                <div className="border-t border-white/10 pt-4 mt-2 flex justify-between items-center">
                  <p className="text-slate-300">Subtotal:</p>
                  <p className="text-2xl font-bold text-white">{calculateSubtotal()} DA</p>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <select 
                className="w-full bg-[#2c2c2e] border border-white/5 rounded-xl px-4 py-3.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all appearance-none"
                value={selectedCustomer} 
                onChange={e => setSelectedCustomer(e.target.value)}
              >
                <option value="">Walk-in Customer (Cash)</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              <input 
                type="number" 
                placeholder="Cash Received (DA) - Optional" 
                className="w-full bg-[#2c2c2e] border border-white/5 rounded-xl px-4 py-3.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                value={cashAmount}
                onChange={e => setCashAmount(e.target.value)}
              />

              <button 
                onClick={handleCheckout}
                className="w-full bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white font-bold py-4 px-4 rounded-xl shadow-lg shadow-blue-500/20 transform transition-all active:scale-[0.98] mt-2"
              >
                ✅ Complete Checkout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: STOCK */}
      {activeTab === 'stock' && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2 ml-1">Current Inventory</h2>
          {inventory.map(item => (
            <div key={item.id} className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 flex justify-between items-center">
              <p className="font-medium text-white">{item.name}</p>
              <div className="text-right">
                <p className="text-sm text-slate-400">Stock: <span className="text-white font-bold">{item.quantity}</span></p>
                <p className="text-sm text-slate-400">Price: {item.price} DA</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 3: CUSTOMERS */}
      {activeTab === 'customers' && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2 ml-1">Client Debts</h2>
          {customers.map(c => (
            <div key={c.id} className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 flex justify-between items-center">
              <div>
                <p className="font-bold text-white text-lg">{c.name}</p>
                <p className="text-xs text-slate-400 mt-1">{c.phone || 'No phone'}</p>
              </div>
              <div className="text-right bg-black/20 px-4 py-2 rounded-xl border border-white/5">
                <p className="text-xs text-slate-400 mb-1">Current Debt</p>
                <p className={`font-bold ${c.debt_balance > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {c.debt_balance} DA
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}