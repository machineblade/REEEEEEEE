import { supabase } from './_supabase.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res
        .status(405)
        .json({ result: 'error', error: 'Use POST for login' });
    }

    let body = '';
    for await (const chunk of req) body += chunk;

    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      return res
        .status(400)
        .json({ result: 'error', error: 'Invalid JSON body' });
    }

    const { username, password } = parsed;
    if (!username || !password) {
      return res
        .status(400)
        .json({ result: 'error', error: 'Missing username or password' });
    }

    const { data, error } = await supabase
      .from('users')
      .select('id, username, password')
      .eq('username', username)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Supabase login error:', error);
      return res
        .status(500)
        .json({ result: 'error', error: 'DB error while logging in' });
    }

    if (!data || data.password !== password) {
      return res
        .status(401)
        .json({ result: 'error', error: 'Invalid username or password' });
    }

    return res.status(200).json({
      result: 'successfully logged',
      user: { id: data.id, username: data.username }
    });
  } catch (err) {
    console.error('Login error:', err);
    return res
      .status(500)
      .json({ result: 'error', error: 'Server error while logging in' });
  }
}
