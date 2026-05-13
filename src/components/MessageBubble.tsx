'use client';
import { useState } from 'react';
import { ProductGrid } from './ProductGrid';
import { ProductDetailModal } from './ProductDetailModal';
import { PRODUCT_TOOL_NAMES } from '@/types';
import type { SerializedMessage, Product } from '@/types';

interface Props {
  message: SerializedMessage;
}

export function MessageBubble({ message }: Props) {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  if (message.role === 'human') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[70%] rounded-2xl rounded-br-sm bg-blue-600 px-4 py-2 text-sm text-white">
          {message.content}
        </div>
      </div>
    );
  }

  if (message.role === 'ai' && !message.content && message.toolCalls?.length) {
    return null;
  }

  if (message.role === 'ai' && message.content) {
    return (
      <div className="flex justify-start">
        <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-slate-700 px-4 py-2 text-sm text-slate-100">
          {message.content}
        </div>
      </div>
    );
  }

  if (message.role === 'tool') {
    const isProductTool = PRODUCT_TOOL_NAMES.includes(message.toolName as any);
    if (!isProductTool) return null;

    try {
      const parsed = JSON.parse(message.content);
      if (!parsed.products?.length) return null;
      return (
        <>
          <ProductGrid products={parsed.products} onProductClick={setSelectedProduct} />
          {selectedProduct && (
            <ProductDetailModal
              product={selectedProduct}
              onClose={() => setSelectedProduct(null)}
            />
          )}
        </>
      );
    } catch {
      return null;
    }
  }

  return null;
}
