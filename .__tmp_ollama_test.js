const OpenAI = require('openai');
(async () => {
  const client = new OpenAI({ baseURL: 'http://127.0.0.1:11434/v1', apiKey: 'ollama' });
  const t0 = Date.now();
  const c = await client.chat.completions.create({
    model: 'phi3:mini',
    messages: [
      { role: 'system', content: "Tu es KIDO, un tuteur IA bienveillant pour un enfant de 10 ans. Langage simple et positif. Maximum 4 phrases." },
      { role: 'user', content: 'Explique les fractions tres simplement pour un enfant de 10 ans.' }
    ],
    temperature: 0.2,
  });
  console.log('ms=', Date.now()-t0);
  console.log(c.choices?.[0]?.message?.content || '');
})().catch((e)=>{ console.error(e.message); process.exit(1); });
