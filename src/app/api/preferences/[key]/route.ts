import { NextRequest } from 'next/server';
import { getPreferences, deletePreference } from '@/lib/store';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  const prefs = getPreferences();
  if (!(key in prefs)) return Response.json({ error: 'Not found' }, { status: 404 });
  deletePreference(key);
  return Response.json({ ok: true });
}
