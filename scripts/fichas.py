"""Le as fichas em texto da Rose e gera fichas.json (sem valores financeiros).
Uso: python scripts/fichas.py "<pasta com os .txt>" <saida.json>"""
import sys, os, re, json, glob, uuid, unicodedata

MESES = {'janeiro':1,'fevereiro':2,'marco':3,'abril':4,'maio':5,'junho':6,'julho':7,'agosto':8,'setembro':9,'outubro':10,'novembro':11,'dezembro':12,'juho':7,'janeiro,':1}
def sem_acento(s): return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn').lower()

# arquivos salvos antes com acento perdido (vira U+FFFD): repoe as palavras mais comuns
TROCAS = [('n�o','não'),('N�O','NÃO'),('��o','ção'),('��','çõ'),('PROFISS�O','PROFISSÃO'),('profiss�o','profissão'),
 ('press�o','pressão'),('sess�o','sessão'),('SESS�O','SESSÃO'),('regi�o','região'),('tera�o','terço'),('ter�o','terço'),('cirurgia','cirurgia'),
 ('incha�o','inchaço'),('inchao','inchaço'),('m��o','não'),('exerc�cio','exercício'),('�gua','água'),('di�ria','diária'),('hist�rico','histórico')]
def conserta(t):
    for a, b in TROCAS: t = t.replace(a, b)
    return t

def ler(p):
    b = open(p, 'rb').read()
    try: t = b.decode('utf-8')
    except UnicodeDecodeError: t = b.decode('cp1252', errors='replace')
    return t.replace('\r\n', '\n').replace('\r', '\n').lstrip('﻿')

# "17 de novembro de 2025", "1 de dezembro de 2025", "19 DE JANEIRO" (sem ano), "23/05/2023"
D_EXT = re.compile(r'^\W*(\d{1,2})\s*(?:de)?\s+([a-zçã]+)(?:\s*(?:de)?\s*(\d{2,4}))?\W*$', re.I)
D_NUM = re.compile(r'^\W*(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{2,4}))?\W*$')
def ano(a, ref):
    if a is None: return ref
    a = int(a); return a + 2000 if a < 100 else a
def data_da_linha(l, ref_ano):
    l = l.strip()
    if not l or len(l) > 40 or re.search(r'nasc', l, re.I): return None
    m = D_EXT.match(sem_acento(l))
    if m and m.group(2) in MESES:
        d, mes, a = int(m.group(1)), MESES[m.group(2)], ano(m.group(3), ref_ano)
    else:
        m = D_NUM.match(l)
        if not m: return None
        d, mes, a = int(m.group(1)), int(m.group(2)), ano(m.group(3), ref_ano)
    if a is None or not (1 <= d <= 31 and 1 <= mes <= 12 and 2015 <= a <= 2027): return None
    return f'{a:04d}-{mes:02d}-{d:02d}'

# linhas que sao so dinheiro/pagamento: removidas (a parte financeira fica de fora)
FIN = re.compile(r'^\W*(r\$\s*)?\d{1,5}([.,]\d{2})?\s*(reais)?\s*(ok|pago|pix|cart[aã]o|dinheiro|debito|credito|d[eé]bito|cr[eé]dito|parcelado|em\s+\d+x)?\W*$', re.I)
FIN2 = re.compile(r'\b(r\$|pix|pagou|pagamento|parcela|parcelad|d[eé]bito|cr[eé]dito|cart[aã]o|valor\s*:?\s*\d|total\s*:?\s*\d|\d{3,5}[,.]00)\b', re.I)
PLANO_PRECO = re.compile(r'^\W*(plano|pacote|promocional?)\W*\d{3,5}(\s*(ok|pago))?\W*$', re.I)
def limpa(txt):
    out = []
    for l in txt.split('\n'):
        s = l.strip()
        if FIN.match(s) or PLANO_PRECO.match(s) or (FIN2.search(s) and re.search(r'\d', s) and len(s) < 60 and not re.search(r'\bml\b|\buni|mg\b', s, re.I)):
            continue
        out.append(l.rstrip())
    return re.sub(r'\n{3,}', '\n\n', '\n'.join(out)).strip()

def nome_de(txt, arq):
    m = re.search(r'^\s*nome\s*[:;]\s*(.+)$', txt, re.I | re.M)
    n = m.group(1).strip() if m else ''
    n = re.sub(r'\s+', ' ', n).strip(' .;:')
    if len(n) < 3: n = os.path.splitext(os.path.basename(arq))[0]
    return n.title() if n.isupper() or n.islower() else n

def nasc_de(txt):
    m = re.search(r'nasc\w*\s*[:;]?\s*(.+)', txt, re.I)
    if not m: return None
    l = m.group(1).strip()
    d = data_da_linha(l, None)
    if d: return d
    m = re.search(r'(\d{1,2})\D+(\d{1,2})\D+(\d{2,4})', l)
    if m:
        d, mes, a = int(m.group(1)), int(m.group(2)), int(m.group(3))
        a = a + (1900 if a > 26 else 2000) if a < 100 else a
        if 1 <= d <= 31 and 1 <= mes <= 12 and 1920 <= a <= 2026: return f'{a:04d}-{mes:02d}-{d:02d}'
    m = re.match(r'(\d{1,2})\s*de\s*([a-zçã]+)\D*(\d{2,4})', sem_acento(l))
    if m and m.group(2) in MESES:
        a = int(m.group(3)); a = a + (1900 if a > 26 else 2000) if a < 100 else a
        return f'{a:04d}-{MESES[m.group(2)]:02d}-{int(m.group(1)):02d}'
    return None

def tel_de(txt):
    m = re.search(r'(?:tel\w*|cel\w*|whats\w*)\s*[:;]?\s*\(?(\d{2})\)?\s*9?\s*(\d{4,5})[\s-]?(\d{4})', txt, re.I)
    return (m.group(1) + m.group(2) + m.group(3)) if m else None

def produto_lote(b):
    pr = re.search(r'(pentoxifilina|toxina[^\n]*|xeomin|botox|[a-z ]*enzim[a-z]*|skinbooster|skinbbooster|[a-z]*bioestimul[a-z]*)', b, re.I)
    lo = re.search(r'\bl\s*[:;]\s*([\w\-]+)', b, re.I)
    return (pr.group(1).strip()[:80] if pr else None), (lo.group(1) if lo else None)

def processa(p):
    txt = ler(p); nome = nome_de(txt, p)
    lines = txt.split('\n')
    ref = None
    idx = []  # (linha, data)
    for i, l in enumerate(lines):
        d = data_da_linha(l, ref)
        if d: idx.append((i, d)); ref = int(d[:4])
        elif ref is None:
            m = re.search(r'\b(20[12]\d)\b', l)
            if m and not re.search(r'nasc', l, re.I): ref = int(m.group(1))
    # cabecalho = antes da primeira data de tratamento; se a ficha comeca pela data da ficha, o cabecalho vai ate "tratamento/plano/procedimento"
    cab_fim = idx[0][0] if idx else len(lines)
    ficha_data = None
    if idx and re.search(r'^\s*nome\s*[:;]', '\n'.join(lines[idx[0][0]:idx[0][0] + 6]), re.I | re.M):
        ficha_data = idx[0][1]
        k = next((j for j in range(idx[0][0], len(lines)) if re.match(r'\s*(plano|tratamento|procedimento|inicio|intraderm|regiao)', sem_acento(lines[j]))), None)
        cab_fim = k if k is not None else len(lines)
        idx = [(i, d) for i, d in idx if i >= cab_fim]
    cab = limpa('\n'.join(lines[:cab_fim]))
    blocos = []
    if ficha_data and cab_fim < len(lines) and not idx:
        blocos.append((ficha_data, '\n'.join(lines[cab_fim:])))
    elif ficha_data and idx and idx[0][0] > cab_fim:
        blocos.append((ficha_data, '\n'.join(lines[cab_fim:idx[0][0]])))
    for n, (i, d) in enumerate(idx):
        fim = idx[n + 1][0] if n + 1 < len(idx) else len(lines)
        blocos.append((d, '\n'.join(lines[i + 1:fim])))
    ats = []
    for d, b in blocos:
        b = limpa(b)
        if not b: continue
        prod, lote = produto_lote(b)
        ats.append({'data': d, 'evolucao': b, 'produto': prod, 'lote': lote})
    return {'arquivo': os.path.basename(p), 'nome': nome, 'nascimento': nasc_de(txt), 'telefone': tel_de(txt), 'ficha': cab, 'atendimentos': ats}

if __name__ == '__main__':
    pasta, saida = sys.argv[1], sys.argv[2]
    docs = [processa(p) for p in sorted(glob.glob(os.path.join(pasta, '*.txt')))]
    json.dump(docs, open(saida, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    print(len(docs), 'pacientes;', sum(len(d['atendimentos']) for d in docs), 'atendimentos;',
          sum(1 for d in docs if d['nascimento']), 'com nascimento;', sum(1 for d in docs if d['telefone']), 'com telefone;',
          sum(1 for d in docs if not d['atendimentos']), 'sem atendimento')
