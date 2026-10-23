# Guia rápido — cartas protegidas da 3DM

## 1. Como cadastrar uma carta

### Imagens do ZIP

Para usar as imagens enviadas, extraia o conteúdo de `img.zip` diretamente na pasta `frontend`:

```text
frontend/img/amizades/...
frontend/img/caretas/...
frontend/img/homenagens/...
```

O código já foi ajustado para usar os nomes reais das imagens, incluindo pastas com espaços e acentos. Não é necessário criar as pastas `optimized` ou `full`.

O arquivo com os dados pessoais **não deve ser publicado no GitHub**. No servidor ou no computador onde a aplicação vai rodar:

```bash
cd backend
cp homenagens.json.example homenagens.json
```

Edite `homenagens.json` e crie um registro para cada pessoa:

```json
{
  "id": "clara",
  "nome": "Clara",
  "senhaHash": "...",
  "mensagem": "A mensagem que somente ela verá.",
  "legenda": "Com carinho, da 3DM",
  "foto": "clara.webp"
}
```

### Regras importantes

- `id` deve ser único, simples e sem espaços; use letras minúsculas, números e hífens.
- `senhaHash` **nunca é a senha em texto puro**.
- `foto` é opcional. Deixe `"foto": ""` para uma carta somente com texto.
- `mensagem` pode ter quebras de linha; o site preserva essas quebras.
- Não coloque senhas ou mensagens em `frontend/`, HTML, JavaScript ou CSS.

O pacote atualizado já inclui cinco cartas iniciais para a busca aparecer: David, Clara, Emanuela, Guilherme e Mathues Xavier. Elas usam a senha provisória `troque-esta-senha` e mensagens de configuração. **Troque imediatamente essas mensagens e gere um hash próprio para cada carta** seguindo a seção abaixo.

## 2. Como criar uma senha diferente para cada carta

No computador de administração, dentro de `backend`:

```bash
node script.js "uma senha diferente e difícil"
```

Copie somente a linha `scrypt-v1$...` para o campo `senhaHash` da pessoa correspondente. Repita com outra senha para cada carta.

Uma boa senha para este projeto deve ter pelo menos 8 caracteres e não ser o nome da pessoa, data de nascimento ou algo que todos conheçam. Guarde a senha por um canal privado; ela não fica recuperável pelo site.

## 3. Como proteger fotos opcionais

As fotos individuais das cartas ficam fora do frontend:

```text
backend/private-homenagens/optimized/
```

Se no JSON estiver `"foto": "clara.webp"`, coloque esse arquivo em `optimized/clara.webp`. Também é possível manter o original em `original/` com extensão `.jpg`, `.jpeg`, `.png` ou `.webp`.

A listagem pública revela apenas nome e identificador. A mensagem e a URL temporária da foto só são entregues depois da senha correta. O link da foto expira em 15 minutos.

## 4. Rodar localmente

Requisitos: Node.js 18 ou mais recente.

```bash
cd backend
npm ci
npm start
```

Abra `http://localhost:3000`. Para testar a saúde do servidor:

```bash
curl http://localhost:3000/health
```

## 5. Deploy em um serviço Node

Use qualquer serviço que aceite um processo Node (por exemplo, Render, Railway ou Fly.io):

1. Suba o projeto em um repositório privado.
2. Configure o diretório de trabalho como `backend`.
3. Comando de instalação: `npm ci`.
4. Comando de inicialização: `npm start`.
5. O serviço deve fornecer a variável `PORT`; o servidor já escuta em `0.0.0.0`.
6. Antes de iniciar, crie `backend/homenagens.json` a partir do exemplo e envie as fotos para `backend/private-homenagens/` por um canal privado.
7. Ative HTTPS no serviço. Não publique a aplicação somente em HTTP.

Se o serviço usar deploy a partir do Git, não comite `homenagens.json` nem `private-homenagens/`; eles já estão protegidos pelo `.gitignore`.

## 6. O que esta segurança cobre — e o que não cobre

Esta é uma proteção adequada para uma cápsula pessoal comum, mas não é segurança de nível bancário:

- as senhas são armazenadas com `scrypt`, não em texto puro;
- cada carta possui sua própria senha;
- há limitação de tentativas por endereço e carta;
- mensagens e fotos não são servidas como arquivos públicos;
- fotos usam tokens temporários e cabeçalho `no-store`;
- o HTTPS do provedor protege os dados durante o transporte.

Ainda assim, quem receber a senha pode abrir a carta, e o administrador do servidor pode acessar os dados. Para conteúdo muito sensível, use um serviço com gestão de segredos, backups criptografados e controle de acesso ao servidor.

## 7. Checklist antes de compartilhar o link

- [ ] Todas as cartas têm `id` único.
- [ ] Cada carta tem um `senhaHash` diferente.
- [ ] Nenhuma senha real aparece nos arquivos do projeto.
- [ ] Cartas sem foto usam `foto` vazio.
- [ ] O site abre com HTTPS.
- [ ] `/health` responde `{"status":"ok"}`.
- [ ] Uma senha errada não revela mensagem nem foto.
- [ ] O repositório está privado e não contém `homenagens.json`.
