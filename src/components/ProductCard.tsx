'use client';
import type { Product } from '@/types';

interface Props {
  product: Product;
  onClick?: (product: Product) => void;
}

export function ProductCard({ product, onClick }: Props) {
  return (
    <article
      tabIndex={0}
      onClick={() => onClick?.(product)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(product); } }}
      className="cursor-pointer rounded-lg border border-slate-700 bg-slate-800 overflow-hidden hover:border-blue-500 transition-colors"
    >
      <img
        src={product.thumbnail}
        alt={product.title}
        className="w-full h-32 object-cover"
      />
      <div className="p-3">
        <h3 className="text-sm font-semibold text-slate-100 line-clamp-1">
          {product.title}
        </h3>
        <p className="text-xs text-slate-400 line-clamp-2 mt-1">
          {product.description}
        </p>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-sm font-bold text-emerald-400">
            ${product.price.toFixed(2)}
          </span>
          <span className="text-xs text-slate-400">⭐ {product.rating}</span>
        </div>
        <span
          className={`mt-1 inline-block text-xs ${
            product.availabilityStatus === 'In Stock'
              ? 'text-emerald-400'
              : 'text-amber-400'
          }`}
        >
          {product.availabilityStatus}
        </span>
      </div>
    </article>
  );
}
