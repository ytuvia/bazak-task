import { http, HttpResponse } from 'msw';

export const mockProducts = [
  {
    id: 1, title: 'iPhone 14', description: 'Latest Apple smartphone', category: 'smartphones',
    price: 999, discountPercentage: 5, rating: 4.5, stock: 100, brand: 'Apple',
    tags: ['phone'], thumbnail: 'https://cdn.dummyjson.com/iphone.jpg',
    images: ['https://cdn.dummyjson.com/iphone.jpg'], availabilityStatus: 'In Stock',
  },
  {
    id: 2, title: 'Samsung Galaxy S23', description: 'Latest Samsung smartphone', category: 'smartphones',
    price: 799, discountPercentage: 10, rating: 4.3, stock: 80, brand: 'Samsung',
    tags: ['phone', 'android'], thumbnail: 'https://cdn.dummyjson.com/samsung.jpg',
    images: ['https://cdn.dummyjson.com/samsung.jpg'], availabilityStatus: 'In Stock',
  },
];

export const mockCategories = [
  { name: 'Smartphones', slug: 'smartphones', url: 'https://dummyjson.com/products/category/smartphones' },
  { name: 'Beauty', slug: 'beauty', url: 'https://dummyjson.com/products/category/beauty' },
];

export const handlers = [
  http.get('https://dummyjson.com/products/search', () =>
    HttpResponse.json({ products: mockProducts, total: mockProducts.length, skip: 0, limit: 10 })
  ),
  http.get('https://dummyjson.com/products/categories', () =>
    HttpResponse.json(mockCategories)
  ),
  http.get('https://dummyjson.com/products/category/:slug', () =>
    HttpResponse.json({ products: mockProducts, total: mockProducts.length, skip: 0, limit: 10 })
  ),
  http.get('https://dummyjson.com/products/:id', ({ params }) => {
    const product = mockProducts.find(p => p.id === parseInt(params.id as string));
    return product
      ? HttpResponse.json(product)
      : HttpResponse.json({ message: 'Product not found' }, { status: 404 });
  }),
];
