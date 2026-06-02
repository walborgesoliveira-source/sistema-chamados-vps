CREATE TABLE IF NOT EXISTS contatos (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    primeiro_nome VARCHAR(100),
    sobrenome VARCHAR(100),
    email VARCHAR(255),
    email2 VARCHAR(255),
    email3 VARCHAR(255),
    telefone VARCHAR(50),
    telefone2 VARCHAR(50),
    telefone3 VARCHAR(50),
    organizacao VARCHAR(255),
    cargo VARCHAR(255),
    notas TEXT,
    labels TEXT,
    data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- chave única: nome + email principal (email pode ser NULL)
    CONSTRAINT uq_contatos UNIQUE NULLS NOT DISTINCT (nome, email)
);

CREATE INDEX IF NOT EXISTS idx_contatos_email ON contatos(email);
CREATE INDEX IF NOT EXISTS idx_contatos_nome ON contatos(nome);
