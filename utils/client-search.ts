import { Q } from '@nozbe/watermelondb';
import { escapeLike } from '@/utils/escape-like';

export function buildClientIdentitySearchClause(searchQuery: string) {
  const query = searchQuery.trim();
  if (!query) return null;

  const like = `%${escapeLike(query)}%`;
  return Q.or(
    Q.where('name', Q.like(like)),
    Q.where('email', Q.like(like)),
    Q.where('company_id', Q.like(like)),
  );
}
