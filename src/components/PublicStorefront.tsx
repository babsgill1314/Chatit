import React, { useState } from 'react';
import { 
  ShoppingBag, Search, Check, Smartphone, ArrowRight, 
  ExternalLink, Sparkles, Filter, X, Plus, Minus, Store,
  ShieldCheck, Star, Truck, RefreshCw, MessageSquare
} from 'lucide-react';
import { Product, CartItem, BusinessIndustry } from '../types';

interface PublicStorefrontProps {
  storeSlug?: string;
  storeName?: string;
  storeTagline?: string;
  whatsappPhone?: string;
  products: Product[];
  currencySymbol?: string;
  onBackToDashboard?: () => void;
  onToast: (msg: string) => void;
}

export const PublicStorefront: React.FC<PublicStorefrontProps> = ({
  storeSlug = 'store_aura_main',
  storeName = 'Aura Luxury Boutique',
  storeTagline = 'Curated Modern Fashion & Artisanal Goods',
  whatsappPhone = '+234 803 999 8888',
  products = [],
  currencySymbol = '$',
  onBackToDashboard,
  onToast
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [selectedColor, setSelectedColor] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Derived categories
  const categories = ['all', ...Array.from(new Set(products.map(p => p.category || 'General')))];

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          p.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const cleanPhone = (whatsappPhone || '').replace(/\D/g, '');

  const openProductModal = (product: Product) => {
    setSelectedProduct(product);
    setSelectedSize(product.sizes?.[0] || 'Standard');
    setSelectedColor(product.colors?.[0] || 'Original');
    setQuantity(1);
  };

  const handleAddToCart = (product: Product) => {
    const size = selectedSize || product.sizes?.[0] || 'Standard';
    const color = selectedColor || product.colors?.[0] || 'Original';

    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id && item.selectedSize === size && item.selectedColor === color);
      if (existing) {
        return prev.map(item => item === existing ? { ...item, quantity: item.quantity + quantity } : item);
      }
      return [...prev, { product, quantity, selectedSize: size, selectedColor: color }];
    });

    setSelectedProduct(null);
    onToast(`Added ${quantity}x "${product.name}" to cart!`);
  };

  const handleDirectWhatsAppBuy = (product: Product) => {
    const size = selectedSize || product.sizes?.[0] || 'Standard';
    const color = selectedColor || product.colors?.[0] || 'Original';
    const total = (product.price * quantity).toFixed(2);

    const message = `Hi ${storeName}! 👋\n\nI want to place an order for:\n• *${product.name}*\n• Quantity: *${quantity}*\n• Option: *${size} / ${color}*\n• Total Price: *${currencySymbol}${total}*\n\nPlease confirm stock availability and send payment/delivery instructions!`;
    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank');
  };

  const handleCheckoutCartWhatsApp = () => {
    if (cart.length === 0) return;
    const subtotal = cart.reduce((acc, item) => acc + (item.product.price * item.quantity), 0);

    let itemsList = '';
    cart.forEach((item, idx) => {
      itemsList += `${idx + 1}. *${item.product.name}* (${item.selectedSize}/${item.selectedColor}) x${item.quantity} = ${currencySymbol}${(item.product.price * item.quantity).toFixed(2)}\n`;
    });

    const message = `Hi ${storeName}! 👋\n\nI would like to order the following items from your catalog:\n\n${itemsList}\n💰 *Total Order Amount: ${currencySymbol}${subtotal.toFixed(2)}*\n\nPlease confirm my order and share delivery details!`;
    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank');
  };

  const cartTotal = cart.reduce((acc, item) => acc + (item.product.price * item.quantity), 0);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
      {/* Top Merchant Context Strip */}
      <div className="bg-slate-900 text-slate-300 text-xs py-2 px-4 border-b border-slate-800">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-mono text-[11px] text-emerald-400 font-bold uppercase tracking-wide">
              Official WhatsApp Storefront
            </span>
            <span className="text-slate-500 hidden sm:inline">· Public Web Landing: /store/{storeSlug}</span>
          </div>

          <div className="flex items-center gap-3">
            {onBackToDashboard && (
              <button
                onClick={onBackToDashboard}
                className="text-xs font-semibold text-slate-200 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Store className="w-3.5 h-3.5 text-indigo-400" />
                <span>Merchant Dashboard</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Hero Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white flex items-center justify-center font-black text-lg shadow-sm">
              {storeName.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-black text-slate-900 leading-tight">{storeName}</h1>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <ShieldCheck className="w-3 h-3 text-emerald-600" /> Verified WhatsApp
                </span>
              </div>
              <p className="text-xs text-slate-500 line-clamp-1">{storeTagline}</p>
            </div>
          </div>

          {/* Cart & Direct WA Button */}
          <div className="flex items-center gap-2.5">
            <a
              href={`https://wa.me/${cleanPhone}`}
              target="_blank"
              rel="noreferrer"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
              <span>Chat on WhatsApp</span>
            </a>

            <button
              onClick={() => setIsCartOpen(true)}
              className="relative p-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-2 cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4" />
              <span className="hidden sm:inline">Bag</span>
              {cart.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-emerald-500 text-white rounded-full text-[10px] font-mono font-bold flex items-center justify-center border-2 border-white">
                  {cart.reduce((sum, item) => sum + item.quantity, 0)}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Search & Categories Bar */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap capitalize transition-colors cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat === 'all' ? 'All Catalog' : cat}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search catalog..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-100 text-slate-900 rounded-xl text-xs border border-transparent focus:border-emerald-500 focus:bg-white outline-hidden transition-all"
            />
          </div>
        </div>
      </header>

      {/* Main Catalog Grid */}
      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 flex-1">
        {filteredProducts.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 p-8 shadow-xs">
            <ShoppingBag className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-800">No products found</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              We couldn't find any products matching your search criteria. Try browsing all catalog categories.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredProducts.map((product) => {
              const hasDiscount = product.originalPrice && product.originalPrice > product.price;

              return (
                <div 
                  key={product.id}
                  className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-lg transition-all flex flex-col group"
                >
                  {/* Product Image */}
                  <div className="relative aspect-square bg-slate-100 overflow-hidden cursor-pointer" onClick={() => openProductModal(product)}>
                    <img 
                      src={product.image || 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=800&q=80'} 
                      alt={product.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    {hasDiscount && (
                      <span className="absolute top-3 left-3 bg-rose-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-md shadow-xs">
                        SAVE {Math.round(((product.originalPrice! - product.price) / product.originalPrice!) * 100)}%
                      </span>
                    )}
                    <span className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-xs text-white text-[10px] font-semibold px-2 py-0.5 rounded-md">
                      {product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}
                    </span>
                  </div>

                  {/* Product Info */}
                  <div className="p-4 flex-1 flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider block mb-1">
                        {product.category}
                      </span>
                      <h3 
                        onClick={() => openProductModal(product)}
                        className="font-bold text-slate-900 text-sm hover:text-emerald-600 transition-colors cursor-pointer line-clamp-1"
                      >
                        {product.name}
                      </h3>
                      <p className="text-xs text-slate-500 line-clamp-2 mt-1 leading-relaxed">
                        {product.description}
                      </p>
                    </div>

                    <div className="pt-4 border-t border-slate-100 mt-4 flex items-center justify-between">
                      <div>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-base font-black text-slate-900">
                            {currencySymbol}{product.price.toLocaleString()}
                          </span>
                          {hasDiscount && (
                            <span className="text-xs text-slate-400 line-through">
                              {currencySymbol}{product.originalPrice?.toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => openProductModal(product)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <Smartphone className="w-3.5 h-3.5" />
                        <span>Order</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Product Detail & Variant Selector Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100 p-6 relative">
            <button
              onClick={() => setSelectedProduct(null)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="aspect-square bg-slate-100 rounded-2xl overflow-hidden">
                <img 
                  src={selectedProduct.image} 
                  alt={selectedProduct.name}
                  className="w-full h-full object-cover" 
                />
              </div>

              <div className="flex flex-col justify-between">
                <div>
                  <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider block">
                    {selectedProduct.category}
                  </span>
                  <h3 className="text-lg font-black text-slate-900 mt-1 leading-tight">
                    {selectedProduct.name}
                  </h3>
                  <div className="text-xl font-black text-slate-900 mt-2">
                    {currencySymbol}{selectedProduct.price.toLocaleString()}
                  </div>
                  <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                    {selectedProduct.description}
                  </p>

                  {/* Size Selector */}
                  {selectedProduct.sizes && selectedProduct.sizes.length > 0 && (
                    <div className="mt-4">
                      <span className="text-[11px] font-bold text-slate-700 block mb-1.5">Select Size:</span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {selectedProduct.sizes.map(size => (
                          <button
                            key={size}
                            onClick={() => setSelectedSize(size)}
                            className={`px-3 py-1 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                              selectedSize === size
                                ? 'border-emerald-600 bg-emerald-50 text-emerald-700 font-bold'
                                : 'border-slate-200 text-slate-600 hover:border-slate-300'
                            }`}
                          >
                            {size}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Color Selector */}
                  {selectedProduct.colors && selectedProduct.colors.length > 0 && (
                    <div className="mt-3">
                      <span className="text-[11px] font-bold text-slate-700 block mb-1.5">Select Color:</span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {selectedProduct.colors.map(color => (
                          <button
                            key={color}
                            onClick={() => setSelectedColor(color)}
                            className={`px-3 py-1 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                              selectedColor === color
                                ? 'border-emerald-600 bg-emerald-50 text-emerald-700 font-bold'
                                : 'border-slate-200 text-slate-600 hover:border-slate-300'
                            }`}
                          >
                            {color}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Quantity Stepper */}
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-700">Quantity:</span>
                    <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden">
                      <button 
                        onClick={() => setQuantity(Math.max(1, quantity - 1))}
                        className="p-1.5 hover:bg-slate-100 text-slate-600 cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="px-3 text-xs font-bold font-mono text-slate-900">{quantity}</span>
                      <button 
                        onClick={() => setQuantity(quantity + 1)}
                        className="p-1.5 hover:bg-slate-100 text-slate-600 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Direct WhatsApp Order Actions */}
                <div className="pt-4 border-t border-slate-100 space-y-2 mt-4">
                  <button
                    onClick={() => handleDirectWhatsAppBuy(selectedProduct)}
                    className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Smartphone className="w-4 h-4" />
                    <span>Order via WhatsApp Now ({currencySymbol}{(selectedProduct.price * quantity).toFixed(2)})</span>
                  </button>

                  <button
                    onClick={() => handleAddToCart(selectedProduct)}
                    className="w-full py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Add to Bag
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Slide-out Cart Drawer */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md h-full shadow-2xl flex flex-col justify-between p-6">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-emerald-600" />
                  <h3 className="font-bold text-slate-900 text-base">Your Shopping Bag</h3>
                </div>
                <button
                  onClick={() => setIsCartOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {cart.length === 0 ? (
                <div className="py-16 text-center text-slate-400">
                  <ShoppingBag className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p className="text-xs">Your bag is empty.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto pr-1 mt-2">
                  {cart.map((item, idx) => (
                    <div key={idx} className="py-3 flex items-center gap-3">
                      <img src={item.product.image} alt={item.product.name} className="w-12 h-12 rounded-xl object-cover" />
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-slate-800 text-xs truncate">{item.product.name}</h4>
                        <span className="text-[10px] text-slate-400 block">{item.selectedSize} · {item.selectedColor}</span>
                        <div className="text-xs font-bold text-slate-900 mt-0.5">
                          {currencySymbol}{item.product.price} × {item.quantity}
                        </div>
                      </div>
                      <button
                        onClick={() => setCart(prev => prev.filter((_, i) => i !== idx))}
                        className="text-slate-400 hover:text-rose-600 text-xs cursor-pointer p-1"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="pt-4 border-t border-slate-200 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Subtotal:</span>
                  <span className="font-bold text-slate-900 text-base">{currencySymbol}{cartTotal.toFixed(2)}</span>
                </div>

                <button
                  onClick={handleCheckoutCartWhatsApp}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Smartphone className="w-4 h-4" />
                  <span>Complete Order on WhatsApp</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        <p className="font-medium text-slate-700">{storeName} · Powered by OmniChat WhatsApp Automation</p>
        <p className="text-[11px] text-slate-400 mt-1">End-to-end encrypted direct WhatsApp checkout · Instant live fulfillment</p>
      </footer>
    </div>
  );
};
