import { FarcasterUser } from '../domain/farcaster-user.js';

// @ts-ignore
const isEdgeFunction = typeof EdgeFunction !== 'undefined';
const isProduction = isEdgeFunction || import.meta.env?.MODE !== 'development';

export async function getUserByFid(
  fid: string,
): Promise<FarcasterUser | undefined> {
  if (!isProduction && fid === '1') return undefined;
  const usersResponse = await fetch(
    `${process.env.NEYNAR_URL}/v2/farcaster/user/bulk?fids=${fid}`,
    {
      method: 'GET',
      headers: buildHeader(process.env.NEYNAR_APIKEY ?? ''),
    },
  );
  const users = await usersResponse.json();
  return users?.users?.length > 0
    ? (users.users[0] as FarcasterUser)
    : undefined;
}

function buildHeader(apiKey: string) {
  return {
    Accept: 'application/json',
    Api_key: apiKey,
  };
}
