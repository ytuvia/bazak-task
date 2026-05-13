import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ProductGrid } from './ProductGrid';
import type { Product } from '@/types';

const products: Product[] = [
  { id: 1, title: 'Product A', description: 'Desc', category: 'cat', price: 10, discountPercentage: 0, rating: 4, stock: 5, brand: 'B', tags: [], thumbnail: 'url', images: ['url'], availabilityStatus: 'In Stock' },
  { id: 2, title: 'Product B', description: 'Desc', category: 'cat', price: 20, discountPercentage: 0, rating: 3, stock: 3, brand: 'B', tags: [], thumbnail: 'url', images: ['url'], availabilityStatus: 'Low Stock' },
];

describe('ProductGrid', () => {
  it('renders one card per product', () => {
    render(<ProductGrid products={products} />);
    expect(screen.getByText('Product A')).toBeInTheDocument();
    expect(screen.getByText('Product B')).toBeInTheDocument();
  });

  it('renders nothing for empty array', () => {
    const { container } = render(<ProductGrid products={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
