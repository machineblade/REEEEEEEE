import { supabase } from './_supabase.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res
        .status(405)
        .json({ success: false, error: 'Use POST for register' });
    }

    let body = '';
    for await (const chunk of req) body += chunk;

    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      return res
        .status(400)
        .json({ success: false, error: 'Invalid JSON body' });
    }

    const { username, password } = parsed;
    if (!username || !password) {
      return res
        .status(400)
        .json({ success: false, error: 'Missing username or password' });
    }

    const { error } = await supabase
      .from('users')
      .insert({ username, password });

    if (error) {
      if (error.code === '23505') {
        // unique violation
        return res
          .status(409)
          .json({ success: false, error: 'Account already exists' });
      }
      console.error('Supabase register error:', error);
      return res
        .status(500)
        .json({ success: false, error: 'DB error while registering' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Register error:', err);
    return res
      .status(500)
      .json({ success: false, error: 'Server error while registering' });
  }
}
