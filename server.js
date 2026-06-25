require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 3000;
const FREE_DAILY_LIMIT = 5;

// DB connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Middleware (Webhooks precisam do body raw, então tratamos antes do express.json global)
app.use((req, res, next) => {
  if (req.originalUrl === '/api/webhook/stripe') {
    next();
  } else {
    express.json()(req, res, next);
  }
});

app.use(cors());

// Helper para pegar/criar o user
async function getOrCreateUser(googleId) {
  let result = await pool.query('SELECT * FROM users WHERE google_id = $1', [googleId]);
  if (result.rows.length === 0) {
    result = await pool.query(
      'INSERT INTO users (google_id) VALUES ($1) RETURNING *',
      [googleId]
    );
  }
  let user = result.rows[0];
  
  // Reseta cota diária se mudou o dia
  const today = new Date().toISOString().split('T')[0];
  const userDate = user.last_reset_date ? user.last_reset_date.toISOString().split('T')[0] : null;
  
  if (userDate !== today) {
    result = await pool.query(
      'UPDATE users SET daily_usage = 0, last_reset_date = CURRENT_DATE WHERE google_id = $1 RETURNING *',
      [googleId]
    );
    user = result.rows[0];
  }
  
  return user;
}

// Rota: Consultar status do usuário
app.get('/api/user/:googleId', async (req, res) => {
  try {
    const user = await getOrCreateUser(req.params.googleId);
    res.json({
      googleId: user.google_id,
      isPro: user.is_pro,
      dailyUsage: user.daily_usage,
      limit: FREE_DAILY_LIMIT
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Rota: Incrementar uso (Chamada quando um link é gerado com sucesso)
app.post('/api/generate', async (req, res) => {
  try {
    const { googleId } = req.body;
    if (!googleId) return res.status(400).json({ error: 'googleId obrigatório' });
    
    let user = await getOrCreateUser(googleId);
    
    if (!user.is_pro && user.daily_usage >= FREE_DAILY_LIMIT) {
      return res.status(403).json({ error: 'Limite diário atingido' });
    }
    
    // Incrementa
    const result = await pool.query(
      'UPDATE users SET daily_usage = daily_usage + 1 WHERE google_id = $1 RETURNING *',
      [googleId]
    );
    
    res.json({ success: true, usage: result.rows[0].daily_usage, isPro: result.rows[0].is_pro });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Rota: Webhook do Stripe (Assinatura ou Pagamento Único)
app.post('/api/webhook/stripe', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook Error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Verifica eventos de checkout concluído
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const clientReferenceId = session.client_reference_id; // Google ID passado na URL
    
    if (clientReferenceId) {
      console.log(`Liberando PRO para googleId: ${clientReferenceId}`);
      await pool.query('UPDATE users SET is_pro = true WHERE google_id = $1', [clientReferenceId]);
    }
  }

  res.send();
});

app.listen(port, () => {
  console.log(`Backend rodando na porta ${port}`);
});
