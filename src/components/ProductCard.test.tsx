import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ProductCard } from './ProductCard';
import type { Product } from '@/types';

const mockProduct: Product = {
  id: 1, title: 'Sony Headphones', description: 'Great wireless headphones for everyday use',
  category: 'electronics', price: 79.99, discountPercentage: 10, rating: 4.5, stock: 50,
  brand: 'Sony', tags: ['audio'], thumbnail: 'https://example.com/sony.jpg',
  images: ['https://example.com/sony.jpg'], availabilityStatus: 'In Stock',
};

describe('ProductCard', () => {
  it('renders title, price, and rating', () => {
    render(<ProductCard product={mockProduct} />);
    expect(screen.getByText('Sony Headphones')).toBeInTheDocument();
    expect(screen.getByText('$79.99')).toBeInTheDocument();
    expect(screen.getByText(/4\.5/)).toBeInTheDocument();
  });

  it('renders thumbnail image with alt text', () => {
    render(<ProductCard product={mockProduct} />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('alt', 'Sony Headphones');
  });

  it('calls onClick when clicked', async () => {
    const onClick = vi.fn();
    render(<ProductCard product={mockProduct} onClick={onClick} />);
    await userEvent.click(screen.getByRole('article'));
    expect(onClick).toHaveBeenCalledWith(mockProduct);
  });

  it('renders availability status', () => {
    render(<ProductCard product={mockProduct} />);
    expect(screen.getByText('In Stock')).toBeInTheDocument();
  });
});
