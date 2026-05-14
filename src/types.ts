export interface Product {
  id: number;
  title: string;
  description: string;
  category: string;
  price: number;
  discountPercentage: number;
  rating: number;
  stock: number;
  brand: string;
  tags: string[];
  thumbnail: string;
  images: string[];
  availabilityStatus: string;
}

export interface ToolResult {
  products: Product[];
  total: number;
  error?: string;
}

export interface Conversation {
  id: string;
  threadId: string;
  title: string;
  createdAt: string;
}

export type StreamChunkType =
  | 'token'
  | 'tool_call'
  | 'tool_result'
  | 'preference_added'
  | 'title_update'
  | 'done'
  | 'error';

export interface StreamChunk {
  type: StreamChunkType;
  content?: string;
  name?: string;
  products?: Product[];
  key?: string;
  value?: string;
  title?: string;
  message?: string;
}

export type MessageRole = 'human' | 'ai' | 'tool';

export interface SerializedMessage {
  id: string;
  role: MessageRole;
  content: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown>; id: string }>;
  toolCallId?: string;
  toolName?: string;
}

export const PRODUCT_TOOL_NAMES = [
  'search_products',
  'browse_category',
  'get_product',
  'list_categories',
] as const;
export type ProductToolName = (typeof PRODUCT_TOOL_NAMES)[number];
