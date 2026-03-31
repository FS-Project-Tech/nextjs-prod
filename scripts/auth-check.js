// Temporary script to test login + validate using provided credentials.
const username = 'Joya';
const password = 'wM^RrnBmxZ%#jtW2GsV%w&s4';

function buildCookieHeader(rawSetCookies = []) {
  return rawSetCookies
    .map((c) => c.split(';')[0])
    .filter(Boolean)
    .join('; ');
}

async function run() {
  const loginRes = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  const loginText = await loginRes.text();
  console.log('login status', loginRes.status, loginText);

  const setCookies =
    typeof loginRes.headers.getSetCookie === 'function'
      ? loginRes.headers.getSetCookie()
      : [loginRes.headers.get('set-cookie')].filter(Boolean);

  const cookieHeader = buildCookieHeader(setCookies);
  console.log('cookie header', cookieHeader);

  const valRes = await fetch('http://localhost:3000/api/auth/validate', {
    headers: { Cookie: cookieHeader },
  });
  const valText = await valRes.text();
  console.log('validate status', valRes.status, valText);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

