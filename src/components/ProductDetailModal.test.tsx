import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ProductDetailModal } from './ProductDetailModal';
import type { Product } from '@/types';

const product: Product = {
  id: 1, title: 'Sony WH-1000XM5', description: 'Industry-leading noise canceling headphones with exceptional sound quality.',
  category: 'electronics', price: 349.99, discountPercentage: 15, rating: 4.8, stock: 25,
  brand: 'Sony', tags: ['audio', 'wireless'],
  thumbnail: 'https://example.com/sony.jpg', images: ['https://example.com/sony1.jpg', 'https://example.com/sony2.jpg'],
  availabilityStatus: 'In Stock',
};

describe('ProductDetailModal', () => {
  it('renders product title and price', () => {
    render(<ProductDetailModal product={product} onClose={vi.fn()} />);
    expect(screen.getByText('Sony WH-1000XM5')).toBeInTheDocument();
    expect(screen.getByText('$349.99')).toBeInTheDocument();
  });

  it('renders full description', () => {
    render(<ProductDetailModal product={product} onClose={vi.fn()} />);
    expect(screen.getByText(/Industry-leading noise canceling/)).toBeInTheDocument();
  });

  it('renders brand and rating', () => {
    render(<ProductDetailModal product={product} onClose={vi.fn()} />);
    expect(screen.getByText('Sony WH-1000XM5')).toBeInTheDocument(); // title
    expect(screen.getByText('Sony')).toBeInTheDocument(); // brand (exact match)
    expect(screen.getByText(/4\.8/)).toBeInTheDocument();
  });

  it('calls onClose when backdrop is clicked', async () => {
    const onClose = vi.fn();
    render(<ProductDetailModal product={product} onClose={onClose} />);
    await userEvent.click(screen.getByTestId('modal-backdrop'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose on ESC key', async () => {
    const onClose = vi.fn();
    render(<ProductDetailModal product={product} onClose={onClose} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
