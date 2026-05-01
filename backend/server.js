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

// Função para gerar o próximo código (CHM-XXXX)
async function gerarProximoCodigo() {
  const result = await pool.query('SELECT COUNT(*) FROM chamados');
  const count = parseInt(result.rows[0].count, 10);
  const nextNum = count + 1;
  return `CHM-${String(nextNum).padStart(4, '0')}`;
}

// Rota para abrir chamado
app.post('/api/chamados', async (req, res) => {
  const { cliente, assunto, prioridade, acoes, dispositivo } = req.body;

  try {
    const codigo = await gerarProximoCodigo();
    const query = `
      INSERT INTO chamados (codigo, cliente, assunto, prioridade, acoes, dispositivo)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
    const values = [codigo, cliente, assunto, prioridade, acoes, dispositivo || 'Web'];
    
    const result = await pool.query(query, values);
    const novoChamado = result.rows[0];

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
app.get('/api/chamados', async (req, res) => {
  const adminToken = process.env.ADMIN_TOKEN;
  const requestToken = req.get('x-admin-token');

  if (!adminToken || requestToken !== adminToken) {
    return res.status(401).json({ erro: 'Não autorizado.' });
  }

  try {
    const result = await pool.query('SELECT * FROM chamados ORDER BY id DESC');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ erro: 'Falha ao buscar chamados.' });
  }
});

// Iniciar Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
