import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MessageBubble } from './MessageBubble';
import type { SerializedMessage } from '@/types';

const humanMsg: SerializedMessage = { id: '1', role: 'human', content: 'Show me phones' };
const aiMsg: SerializedMessage = { id: '2', role: 'ai', content: 'Here are some phones:' };
const aiToolOnlyMsg: SerializedMessage = {
  id: '3', role: 'ai', content: '',
  toolCalls: [{ name: 'search_products', args: { query: 'phones' }, id: 'tc1' }],
};
const toolMsgWithProducts: SerializedMessage = {
  id: '4', role: 'tool', content: JSON.stringify({ products: [
    { id: 1, title: 'iPhone', description: 'Phone', category: 'phones', price: 999, discountPercentage: 0, rating: 4.5, stock: 10, brand: 'Apple', tags: [], thumbnail: 'url', images: ['url'], availabilityStatus: 'In Stock' },
  ], total: 1 }), toolName: 'search_products',
};
const toolMsgEmpty: SerializedMessage = {
  id: '5', role: 'tool', content: JSON.stringify({ products: [], total: 0 }),
  toolName: 'search_products',
};

describe('MessageBubble', () => {
  it('renders human message right-aligned', () => {
    const { container } = render(<MessageBubble message={humanMsg} />);
    expect(screen.getByText('Show me phones')).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('justify-end');
  });

  it('renders AI message left-aligned', () => {
    const { container } = render(<MessageBubble message={aiMsg} />);
    expect(screen.getByText('Here are some phones:')).toBeInTheDocument();
    expect(container.firstChild).not.toHaveClass('justify-end');
  });

  it('renders nothing for AI message with tool calls only', () => {
    const { container } = render(<MessageBubble message={aiToolOnlyMsg} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders ProductGrid for tool message with products', () => {
    render(<MessageBubble message={toolMsgWithProducts} />);
    expect(screen.getByText('iPhone')).toBeInTheDocument();
  });

  it('renders nothing for tool message with empty products', () => {
    const { container } = render(<MessageBubble message={toolMsgEmpty} />);
    expect(container.firstChild).toBeNull();
  });
});
