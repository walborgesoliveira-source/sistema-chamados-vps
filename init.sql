CREATE TABLE IF NOT EXISTS chamados (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(20) UNIQUE NOT NULL,
    cliente VARCHAR(255) NOT NULL,
    assunto VARCHAR(255) NOT NULL,
    prioridade VARCHAR(50) NOT NULL,
    acoes TEXT,
    status VARCHAR(50) DEFAULT 'Aberto',
    dispositivo VARCHAR(100),
    data_abertura TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_finalizacao TIMESTAMP
);

-- Inserir um chamado de teste
INSERT INTO chamados (codigo, cliente, assunto, prioridade, dispositivo)
VALUES ('CHM-0001', 'Sistema Inicial', 'Teste de Conexão DB', 'Baixa', 'Servidor')
ON CONFLICT DO NOTHING;
