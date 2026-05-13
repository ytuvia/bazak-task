import { getPreferences, clearPreferences } from '@/lib/store';

export async function GET() {
  return Response.json(getPreferences());
}

export async function DELETE() {
  clearPreferences();
  return Response.json({ ok: true });
}
