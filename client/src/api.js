const API = 'http://localhost:4000/';

let session = JSON.parse(sessionStorage.getItem('session') || 'null'); // { token, refreshToken }

export const hasSession = () => session !== null;
export const getRefreshToken = () => session?.refreshToken;

export function setSession(p) {
  session = { token: p.token, refreshToken: p.refreshToken };
  sessionStorage.setItem('session', JSON.stringify(session));
}

export function clearSession() {
  session = null;
  sessionStorage.removeItem('session');
}

export async function gql(query, variables, retry = true) {
  let res;
  try {
    res = await fetch(API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch {
    throw new Error(`Cannot reach the server at ${API} (is it running?)`);
  }
  const json = await res.json();
  const err = json.errors?.[0];
  // Access token expired: refresh once and retry the request.
  if (err?.extensions?.code === 'UNAUTHENTICATED' && session && retry) {
    if (await refresh()) return gql(query, variables, false);
  }
  if (err) throw new Error(err.message);
  return json.data;
}

// Refresh tokens work only once, so parallel requests share one refresh.
let refreshing = null;
function refresh() {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const d = await gql(
          `mutation($t:String!){refreshToken(refreshToken:$t){token refreshToken}}`,
          { t: session.refreshToken },
          false
        );
        setSession(d.refreshToken);
        return true;
      } catch {
        clearSession();
        return false;
      } finally {
        refreshing = null;
      }
    })();
  }
  return refreshing;
}
