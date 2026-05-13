'use client';
import { ProductCard } from './ProductCard';
import type { Product } from '@/types';

interface Props {
  products: Product[];
  onProductClick?: (product: Product) => void;
}

export function ProductGrid({ products, onProductClick }: Props) {
  if (products.length === 0) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 my-2">
      {products.map(p => (
        <ProductCard key={p.id} product={p} onClick={onProductClick} />
      ))}
    </div>
  );
}
