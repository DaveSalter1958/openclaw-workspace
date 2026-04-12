import { NextRequest, NextResponse } from 'next/server';

const GATEWAY_URL = 'http://127.0.0.1:18789/v1/chat/completions';
const GATEWAY_TOKEN = 'a2ca6846fe00a853f65fd8a1cb93b2d04b400a1436cd71fa';
const SESSION_USER = 'mission-control-guy-page';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const message = typeof body.message === 'string' ? body.message.trim() : '';

  if (!message) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }

  // Pull conversation history from client for context (up to last 20 turns)
  const history: { role: string; content: string }[] = Array.isArray(body.messages)
    ? body.messages.slice(-20)
    : [];

  const payload = {
    model: 'openclaw',
    user: SESSION_USER,
    messages: [
      ...history,
      { role: 'user', content: message },
    ],
    stream: false,
  };

  let reply: string;
  try {
    const response = await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GATEWAY_TOKEN}`,
        'x-openclaw-agent-id': 'main',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Gateway error', response.status, text);
      return NextResponse.json({ error: `Gateway responded with ${response.status}` }, { status: 502 });
    }

    const data = await response.json();
    reply = data?.choices?.[0]?.message?.content ?? 'No reply from gateway.';
  } catch (err) {
    console.error('Guy gateway fetch failed', err);
    return NextResponse.json({ error: 'Could not reach the gateway' }, { status: 502 });
  }

  return NextResponse.json({ reply }, { status: 200 });
}
