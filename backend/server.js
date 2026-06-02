const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Serve os arquivos estáticos (A interface bonita que criamos)
app.use(express.static(path.join(__dirname, 'public')));

// Configuração do PostgreSQL
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'admin',
  password: process.env.DB_PASSWORD || 'adminpassword',
  database: process.env.DB_NAME || 'chamados'
});

// Testar conexão
pool.connect()
  .then(() => console.log('Conectado ao PostgreSQL com sucesso!'))
  .catch(err => console.error('Erro ao conectar no banco de dados', err.stack));

const STATUS_VALIDOS = ['Aberto', 'Em andamento', 'Finalizado'];

function exigirAdmin(req, res, next) {
  const adminToken = process.env.ADMIN_TOKEN;
  const requestToken = req.get('x-admin-token');

  if (!adminToken || requestToken !== adminToken) {
    return res.status(401).json({ erro: 'Não autorizado.' });
  }

  next();
}

function formatarCodigo(id) {
  return `CHM-${String(id).padStart(4, '0')}`;
}

async function enviarChamadoParaCoreps(chamado) {
  const url = process.env.COREPS_INTEGRATION_URL;
  const token = process.env.COREPS_CHAMADOS_TOKEN;

  if (!url || !token) {
    return;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-coreps-token': token,
      },
      body: JSON.stringify({
        codigo: chamado.codigo,
        cliente: chamado.cliente,
        assunto: chamado.assunto,
        prioridade: chamado.prioridade,
        acoes: chamado.acoes,
        dispositivo: chamado.dispositivo,
        status: chamado.status,
        data_abertura: chamado.data_abertura,
        data_finalizacao: chamado.data_finalizacao,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error('Falha ao integrar chamado ao CORE PS:', response.status, body);
    }
  } catch (error) {
    console.error('Erro ao integrar chamado ao CORE PS:', error.message);
  }
}

// Rota de busca de clientes (contatos locais + COREPS)
app.get('/api/clientes', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json([]);

  // Busca local na tabela contatos
  let locais = [];
  try {
    const result = await pool.query(
      `SELECT DISTINCT nome FROM contatos WHERE nome ILIKE $1 ORDER BY nome LIMIT 10`,
      [`%${q}%`]
    );
    locais = result.rows.map(r => ({ nome: r.nome }));
  } catch { /* ignora erro de banco */ }

  // Busca no COREPS
  let coreps = [];
  const url = process.env.COREPS_INTEGRATION_URL;
  const token = process.env.COREPS_CHAMADOS_TOKEN;
  if (url && token) {
    try {
      const base = url.replace(/\/chamados$/, '');
      const response = await fetch(`${base}/clientes?q=${encodeURIComponent(q)}`, {
        headers: { 'x-coreps-token': token },
      });
      if (response.ok) coreps = await response.json();
    } catch { /* ignora falha de rede */ }
  }

  // Mescla sem duplicatas (por nome normalizado)
  const vistos = new Set();
  const merged = [];
  for (const c of [...locais, ...coreps]) {
    const key = c.nome.trim().toLowerCase();
    if (!vistos.has(key)) {
      vistos.add(key);
      merged.push({ nome: c.nome.trim() });
    }
  }

  res.json(merged.slice(0, 15));
});

// Rota para abrir chamado
app.post('/api/chamados', async (req, res) => {
  const { cliente, assunto, prioridade, acoes, dispositivo } = req.body;

  if (!cliente || !assunto || !prioridade) {
    return res.status(400).json({ sucesso: false, erro: 'Cliente, assunto e prioridade são obrigatórios.' });
  }

  try {
    const idResult = await pool.query("SELECT nextval(pg_get_serial_sequence('chamados', 'id')) AS id");
    const id = Number(idResult.rows[0].id);
    const codigo = formatarCodigo(id);
    const query = `
      INSERT INTO chamados (id, codigo, cliente, assunto, prioridade, acoes, dispositivo)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;
    const values = [id, codigo, cliente, assunto, prioridade, acoes, dispositivo || 'Web'];
    
    const result = await pool.query(query, values);
    const novoChamado = result.rows[0];

    enviarChamadoParaCoreps(novoChamado);

    res.status(201).json({
      sucesso: true,
      id: novoChamado.codigo,
      dataAbertura: novoChamado.data_abertura
    });
  } catch (error) {
    console.error('Erro ao inserir chamado:', error);
    res.status(500).json({ sucesso: false, erro: 'Falha no servidor ao registrar chamado.' });
  }
});

// Rota para listar chamados (Painel de Administração futuro)
app.get('/api/chamados', exigirAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM chamados ORDER BY id DESC');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ erro: 'Falha ao buscar chamados.' });
  }
});

app.patch('/api/chamados/:id/status', exigirAdmin, async (req, res) => {
  const { status } = req.body;

  if (!STATUS_VALIDOS.includes(status)) {
    return res.status(400).json({ erro: 'Status inválido.' });
  }

  try {
    const finalizadoEm = status === 'Finalizado' ? 'CURRENT_TIMESTAMP' : 'NULL';
    const result = await pool.query(
      `UPDATE chamados
       SET status = $1, data_finalizacao = ${finalizadoEm}
       WHERE id = $2
       RETURNING *`,
      [status, req.params.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ erro: 'Chamado não encontrado.' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ erro: 'Falha ao atualizar chamado.' });
  }
});

// Iniciar Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
