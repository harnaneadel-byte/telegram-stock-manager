import React from 'react';

export default function Receipt({ invoiceData, cart, customerName, total, cashReceived }) {
  // Format date nicely
  const date = new Date().toLocaleString('en-GB', { 
    day: '2-digit', month: '2-digit', year: 'numeric', 
    hour: '2-digit', minute: '2-digit' 
  });

  return (
    <div id="printable-receipt" className="bg-white p-4 text-black w-[80mm] mx-auto text-sm font-mono hidden-on-screen">
      <div className="text-center mb-4">
        <h2 className="font-bold text-xl">SORALI DISTRIBUTION</h2>
        <p className="text-xs">Main Warehouse - Oum El Bouaghi</p>
        <p className="text-xs">Tel: +213 XX XX XX XX</p>
        <div className="border-b-2 border-dashed border-black my-2"></div>
      </div>

      <div className="mb-4 text-xs">
        <p><strong>Date:</strong> {date}</p>
        <p><strong>Invoice #:</strong> {invoiceData?.invoice_number || 'N/A'}</p>
        <p><strong>Customer:</strong> {customerName || 'Walk-in Customer'}</p>
      </div>

      <div className="border-b-2 border-dashed border-black my-2"></div>

      <table className="w-full text-xs text-left mb-4">
        <thead>
          <tr className="border-b border-black">
            <th className="py-1">Item</th>
            <th className="py-1 text-center">Qty</th>
            <th className="py-1 text-right">Price</th>
          </tr>
        </thead>
        <tbody>
          {cart.map((item, idx) => (
            <tr key={idx}>
              <td className="py-1 pr-1 truncate max-w-[40mm]">{item.name}</td>
              <td className="py-1 text-center">{item.quantity}</td>
              <td className="py-1 text-right">{item.unit_price}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="border-b-2 border-dashed border-black my-2"></div>

      <div className="text-right text-xs space-y-1 mb-4">
        <p><strong>Total:</strong> {total} DA</p>
        <p><strong>Cash Paid:</strong> {cashReceived || 0} DA</p>
        <p><strong>Balance Due:</strong> {total - (cashReceived || 0) > 0 ? total - (cashReceived || 0) : 0} DA</p>
      </div>

      <div className="border-b-2 border-dashed border-black my-2"></div>

      <div className="text-center text-xs mt-4">
        <p>Thank you for your business!</p>
        <p>***</p>
      </div>
    </div>
  );
}