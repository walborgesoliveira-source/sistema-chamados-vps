#!/usr/bin/env python3
"""
Importa contatos do CSV exportado pelo Gmail para a tabela contatos do banco.
Uso: python3 importar_contatos.py contacts.csv
"""

import csv
import subprocess
import sys
import os
import tempfile

CSV_FILE = sys.argv[1] if len(sys.argv) > 1 else "contacts.csv"
CONTAINER = "chamados_db"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

def get_env():
    env_path = os.path.join(SCRIPT_DIR, '..', '.env')
    env = {}
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                env[k.strip()] = v.strip()
    return env

def run_sql_file(sql_content, env):
    cmd = ['docker', 'exec', '-i', CONTAINER,
           'psql', f"-U{env['POSTGRES_USER']}", f"-d{env['POSTGRES_DB']}"]
    result = subprocess.run(cmd, input=sql_content, capture_output=True, text=True)
    return result

def esc(val):
    if val is None or val == '':
        return 'NULL'
    return "'" + val.replace("'", "''") + "'"

def v(row, key):
    return row.get(key, '').strip() or None

def main():
    env = get_env()

    # Aplicar migração
    print("Aplicando migração da tabela contatos...")
    migration = open(os.path.join(SCRIPT_DIR, 'migrate_contatos.sql')).read()
    r = run_sql_file(migration, env)
    if r.returncode != 0:
        print(f"  [AVISO] {r.stderr.strip()}")
    print("OK\n")

    csv_path = CSV_FILE if os.path.isabs(CSV_FILE) else os.path.join(SCRIPT_DIR, CSV_FILE)
    with open(csv_path, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    print(f"Total no CSV: {len(rows)} linha(s)")

    # Montar um único bloco SQL com todos os INSERTs
    statements = []
    pulados = 0

    for row in rows:
        primeiro = (v(row, 'First Name') or '')
        sobrenome = (v(row, 'Last Name') or '')
        nome = ' '.join(filter(None, [primeiro, sobrenome])) or v(row, 'Organization Name')

        if not nome:
            pulados += 1
            continue

        email    = v(row, 'E-mail 1 - Value')
        email2   = v(row, 'E-mail 2 - Value')
        email3   = v(row, 'E-mail 3 - Value')
        telefone  = v(row, 'Phone 1 - Value')
        telefone2 = v(row, 'Phone 2 - Value')
        telefone3 = v(row, 'Phone 3 - Value')
        org   = v(row, 'Organization Name')
        cargo = v(row, 'Organization Title')
        notas = v(row, 'Notes')
        labels = v(row, 'Labels')

        statements.append(
            "INSERT INTO contatos "
            "(nome,primeiro_nome,sobrenome,email,email2,email3,telefone,telefone2,telefone3,organizacao,cargo,notas,labels) "
            f"VALUES ({esc(nome)},{esc(primeiro)},{esc(sobrenome)},"
            f"{esc(email)},{esc(email2)},{esc(email3)},"
            f"{esc(telefone)},{esc(telefone2)},{esc(telefone3)},"
            f"{esc(org)},{esc(cargo)},{esc(notas)},{esc(labels)}) "
            "ON CONFLICT ON CONSTRAINT uq_contatos DO NOTHING;"
        )

    print(f"Enviando {len(statements)} inserts ao banco (1 chamada)...")

    sql_batch = '\n'.join(statements)
    r = run_sql_file(sql_batch, env)

    if r.returncode != 0:
        print(f"[ERRO] {r.stderr.strip()}")
        sys.exit(1)

    # Contar resultado
    r2 = run_sql_file("SELECT COUNT(*) FROM contatos;", env)
    total_linha = [l for l in r2.stdout.splitlines() if l.strip().lstrip('-').strip().isdigit()]
    total = total_linha[0].strip() if total_linha else '?'

    print(f"\nImportação concluída!")
    print(f"  Linhas no CSV     : {len(rows)}")
    print(f"  Pulados (sem nome): {pulados}")
    print(f"  Total no banco    : {total}")

if __name__ == '__main__':
    main()
