import axios from 'axios';

const backendEndpoints = {
  login: '/auth/discord-login',
  signup: '/auth/discord-signup',
};

const unavailable = (res) => res.status(502).json({
  error: 'Discord authorization is temporarily unavailable.',
});

export default async function discordOAuth(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }

  const action = req.query.action;
  const backendEndpoint = typeof action === 'string' ? backendEndpoints[action] : null;
  if (!backendEndpoint) {
    return res.status(404).json({ error: 'Discord authorization route not found.' });
  }

  try {
    const response = await axios.get(`http://127.0.0.1:5000${backendEndpoint}`, {
      maxRedirects: 0,
      validateStatus: () => true,
      headers: {
        cookie: req.headers.cookie || '',
        'user-agent': req.headers['user-agent'] || 'SansyWebFrontend/1.0',
      },
    });
    const location = response.headers.location;
    if (response.status < 300 || response.status >= 400 || typeof location !== 'string') {
      console.error(`Discord OAuth backend returned HTTP ${response.status} for ${action}.`);
      return unavailable(res);
    }

    let authorizationUrl;
    try {
      authorizationUrl = new URL(location);
    } catch (error) {
      console.error(`Discord OAuth backend returned an invalid redirect for ${action}.`);
      return unavailable(res);
    }

    if (authorizationUrl.protocol !== 'https:' ||
      authorizationUrl.hostname !== 'discord.com' ||
      authorizationUrl.pathname !== '/oauth2/authorize') {
      console.error(`Discord OAuth backend returned an unexpected redirect for ${action}.`);
      return unavailable(res);
    }

    return res.redirect(302, authorizationUrl.toString());
  } catch (error) {
    console.error(`Discord OAuth backend request failed for ${action}:`, error.message);
    return unavailable(res);
  }
}
