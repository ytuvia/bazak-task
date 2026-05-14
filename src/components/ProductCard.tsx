'use client';
import Image from 'next/image';
import type { Product } from '@/types';

interface Props {
  product: Product;
  onClick?: (product: Product) => void;
}

export function ProductCard({ product, onClick }: Props) {
  const discounted = product.discountPercentage >= 5;

  return (
    <article
      tabIndex={0}
      onClick={() => onClick?.(product)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(product); } }}
      className="cursor-pointer rounded-xl border border-slate-700 bg-slate-800 overflow-hidden hover:border-blue-500 hover:shadow-lg hover:shadow-blue-900/20 transition-all duration-150 flex flex-col"
    >
      <div className="relative bg-slate-900 flex items-center justify-center" style={{ aspectRatio: '4/3' }}>
        <Image
          src={product.thumbnail}
          alt={product.title}
          fill
          sizes="(max-width: 640px) 50vw, 33vw"
          className="object-contain p-2"
        />
        {discounted && (
          <span className="absolute top-2 left-2 rounded-md bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            -{Math.round(product.discountPercentage)}%
          </span>
        )}
      </div>

      <div className="p-3 flex flex-col flex-1">
        <h3 className="text-xs font-semibold text-slate-100 line-clamp-2 leading-snug">
          {product.title}
        </h3>

        <div className="mt-auto pt-2 flex items-end justify-between gap-1">
          <div className="flex flex-col">
            <span className="text-sm font-bold text-emerald-400">
              ${product.price.toFixed(2)}
            </span>
            {discounted && (
              <span className="text-[10px] text-slate-500 line-through">
                ${(product.price / (1 - product.discountPercentage / 100)).toFixed(2)}
              </span>
            )}
          </div>
          <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
            ★ {product.rating.toFixed(1)}
          </span>
        </div>

        <span
          className={`mt-1.5 text-[10px] font-medium ${
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
