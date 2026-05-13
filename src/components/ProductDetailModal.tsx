'use client';
import { useEffect } from 'react';
import type { Product } from '@/types';

interface Props {
  product: Product;
  onClose: () => void;
}

export function ProductDetailModal({ product, onClose }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      data-testid="modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="relative bg-slate-800 rounded-xl max-w-lg w-full mx-4 overflow-y-auto max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <button
          aria-label="Close"
          onClick={onClose}
          className="absolute top-3 right-3 text-slate-400 hover:text-white text-xl"
        >
          ✕
        </button>

        {product.images.length > 0 && (
          <div className="flex gap-2 overflow-x-auto p-4">
            {product.images.map((img, i) => (
              <img
                key={i}
                src={img}
                alt={`${product.title} ${i + 1}`}
                className="h-40 w-auto rounded object-cover flex-shrink-0"
              />
            ))}
          </div>
        )}

        <div className="p-5">
          <h2 id="modal-title" className="text-xl font-bold text-white">{product.title}</h2>
          <p className="text-slate-400 text-sm mt-1">{product.brand}</p>

          <div className="flex items-center gap-4 mt-3">
            <span className="text-2xl font-bold text-emerald-400">
              ${product.price.toFixed(2)}
            </span>
            {product.discountPercentage > 0 && (
              <span className="text-sm text-amber-400">
                {product.discountPercentage}% off
              </span>
            )}
            <span className="text-sm text-slate-400">⭐ {product.rating}</span>
          </div>

          <p className="text-slate-300 text-sm mt-4">{product.description}</p>

          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <div className="text-slate-400">
              Stock: <span className="text-slate-200">{product.stock}</span>
            </div>
            <div className="text-slate-400">
              Status:{' '}
              <span
                className={
                  product.availabilityStatus === 'In Stock'
                    ? 'text-emerald-400'
                    : 'text-amber-400'
                }
              >
                {product.availabilityStatus}
              </span>
            </div>
          </div>

          {product.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {product.tags.map(tag => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 text-xs"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
