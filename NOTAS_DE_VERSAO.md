# Notas de versão

Este arquivo resume, em linguagem para usuários, as mudanças relevantes entre versões do sistema.

## Não publicado

### Adicionado

- Nova tela **Administração** (`/administracao`) unifica usuários, órgãos, permissões, tipos de itens/contrato/contratação e atalho para backup em abas. O menu lateral passa a ter um único item «Administração»; `/users` redireciona para `?tab=usuarios`.
- Administradores podem **excluir contrato** na tela de detalhe, com confirmação (digitar EXCLUIR ou o número) e justificativa obrigatória. A exclusão só é permitida quando não há medições, aditivos, memória financeira, governança ou funcionalidades já avaliadas; caso contrário, o sistema orienta a usar «Suspenso» ou «Encerrado». A operação fica registrada em auditoria.
- Cadastro e edição de contratos passam a usar a seção **Itens contratuais**: lista dinâmica de itens precificados (mensalidade, implantação, horas, UST, equipamentos, licenças etc.), com tipo padronizado, descrição livre do contrato, unidade, quantidade, valores, periodicidade quando recorrente e totais consolidados (recorrente, único, sob demanda e global estimado). Após medições ou histórico financeiro, a exclusão definitiva do item é bloqueada — permanece o cancelamento.
- Criada a rotina de manutenção das notas de versão para registrar mudanças funcionais, melhorias de interface, alterações de permissões e ajustes relevantes para operação.
- Área administrativa **Backup e migração** (só administradores): exporta e restaura a base PostgreSQL, preferências do sistema e, opcionalmente, anexos, para facilitar a mudança de servidor. Segredos de ambiente não entram no ficheiro; a tela mostra quais variáveis estão definidas no destino.
- Backup automático para **S3** (AWS, MinIO, R2): configuração pela interface, envio diário com retenção diária/semanal/mensal, execução manual, listagem e restauração a partir do bucket. A chave secreta fica criptografada na base.
- Adicionada a opção de excluir tarefas dentro de um projeto, com confirmação antes da remoção.
- Adicionado cadastro público pela tela de login, com aprovação ou recusa de novos usuários pela administração.
- Adicionado o Resumo Operacional para acompanhar chamados abertos/fechados, tarefas concluídas e alterações em contratos por dia, semana ou mês.
- Adicionado histórico auditável de itens contratuais, registrando inserção, exclusão e mudança de status com usuário e data.
- Adicionados botões na área autenticada para abrir o manual do sistema e as notas de versão.
- Adicionado aviso de nova versão para orientar usuários a atualizar o PWA quando um novo deploy estiver disponível.
- Adicionado campo próprio “Código do Item” nas funcionalidades contratuais, separado do nome/descrição do item do Termo de Referência.
- Adicionada classificação de criticidade em módulos e funcionalidades, com recálculo automático dos pesos proporcionais e reflexos financeiros.
- Adicionado fiscal responsável por módulo, vinculado a usuários do sistema para validação da entrega.
- Adicionada sanfona nos módulos do contrato para ocultar/mostrar funcionalidades e reduzir rolagem em contratos extensos.
- Adicionado resumo no topo de cada módulo com total de itens, entregues, parciais, não entregues e fiscal responsável.
- Adicionado relatório administrativo de uso por usuário dentro do Resumo Operacional, com logins, tempo aproximado de uso ativo e áreas acessadas.
- Adicionados comentários nas tarefas de projeto, com histórico por tarefa, autor e data de registro.
- Adicionado vínculo de tarefas de projeto a usuários do sistema: uma pessoa principal por tarefa e múltiplos responsáveis PMF por tarefa.
- Adicionado perfil do usuário com nome, sobrenome, cargo/função, setor/unidade, telefone/ramal e cor escolhida em paleta, usados na identificação de pessoas vinculadas a projetos.
- Adicionada tela final da meta, com definição textual da meta, vínculo opcional a um projeto inteiro e seleção de várias tarefas de projetos diferentes.
- Adicionados filtros por projeto e responsável na seleção de tarefas vinculadas a uma meta.
- A lista de fornecedores agora mostra os contratos vinculados como links para abrir diretamente o detalhe de cada contrato.
- Adicionado alerta visual e mensagem em pop-up quando o Código do Item obrigatório de uma funcionalidade contratual não é preenchido antes de salvar.
- O histórico auditável dos itens contratuais passou a mostrar o antes e depois de alterações no Código do Item e na descrição/nome da funcionalidade.
- Adicionados filtros por status de entrega, criticidade e texto na gestão de módulos e funcionalidades dos contratos.
- No quadro de chamados GLPI, segundo painel métrico («Tempo desde a última interação»), no mesmo formato do painel de idade dos abertos: mostra quantos chamados estão em cada faixa de dias desde a última alteração vista no GLPI (cache). Ao clicar numa faixa, o Kanban filtra apenas esses chamados.
- Adicionada a tela Minhas atribuições para o usuário acompanhar chamados, tarefas, projetos, contratos e módulos vinculados a ele.
- Anexos de medições, glosas e tarefas de projeto: pré-visualização em modal para PDF e imagens; outros tipos abrem apenas a opção de descarregar o ficheiro. Utilizadores com permissão de edição ou administração podem remover um anexo após confirmar.
- Quadro de chamados GLPI: é mostrada a **última sincronização** com o servidor (bem-sucedida ou última tentativa) e, para **administradores e editores**, um botão que **dispara já** uma nova sincronização com o GLPI (refresh do cache).

### Alterado

- A tela **Funcionalidades** passa a carregar resumos primeiro e só busca módulos/itens ao expandir cada sanfona (com «Carregar mais» quando houver paginação). Filtros por texto, status de entrega e criticidade pesquisam no servidor. Perfis de leitura (VIEWER) veem a lista sem editar; administradores e editores mantêm as ações e o atalho «Abrir contrato».
- O **formulário de contrato** passa a usar os catálogos da Administração: número formal (somente dígitos) com pré-visualização número/ano, órgão gestor, tipo de contrato, modalidade e procedimento licitatório; o código interno SIGTI é gerado ao salvar. A ficha do contrato exibe código interno, identificação formal, órgão, contratação e valores globais original/vigente quando existirem.
- O **formulário de usuário** exige nome completo, CPF (com validação), órgão e demais credenciais na criação; a grade de usuários mostra órgão, CPF mascarado e destaca cadastros incompletos (sem CPF ou órgão).
- No formulário de contrato, os campos fixos de mensalidade e implantação foram substituídos pela seção de itens contratuais; a mensalidade equivalente e os valores únicos continuam sincronizados para medições, snapshots e relatórios existentes.

### Técnico

- Documentação e scripts para **migração Railway → Coolify** (`docs/migracao-railway-coolify.md`, `docker-compose.coolify.yml`, `scripts/db-export.sh`, `scripts/db-import.sh`, `.env.coolify.example`). Dumps de base e anexos **não** devem ser versionados no Git.
- Fluxo **dump no Git → restore Coolify**: workflow **Export DB migration dump**, ficheiro `migration/gti-railway.dump`, variáveis `GTI_EXPORT_MIGRATION_DUMP` (Railway) e `GTI_IMPORT_MIGRATION_DUMP` (Coolify, one-shot). Remover dump do repo após migração.
- Backup in-app (ADMIN): APIs `/api/admin/backup` (export `pg_dump` + tar.gz, import `pg_restore`); limite de upload configurável com `BACKUP_MAX_MB` (predefinição 512).
- Backup S3: modelo `S3BackupConfig`, APIs `/api/admin/backup/s3` (+ `run`, `objects`, `restore`), cron via `instrumentation`/`node-cron`, crypto com `BACKUP_ENCRYPTION_KEY` (ou `JWT_SECRET`), bootstrap opcional `S3_BACKUP_*`.
- Itens de precificação do contrato: modelos `ContractItemType`, `MeasureUnit` e `ContractPricingItem`, migração com seed de tipos/unidades e backfill a partir de mensalidade/implantação; auditoria em `AuditLog` por inclusão, edição, cancelamento e exclusão.

### Corrigido

- Imagem Docker: o diretório de anexos (`uploads` sob `apps/frontend`) passa a ser criado com permissão para o utilizador `node`, corrigindo o erro «permission denied» ao enviar ficheiros em contentores.
- Backup/exportação: a imagem passa a incluir o cliente **PostgreSQL 18** (`pg_dump`/`pg_restore`), compatível com bases Railway recentes; erros deixam de expor a URL da base de dados.
- Railway com volume persistente: documentação e `docker-entrypoint.sh` reforçados com **`RAILWAY_RUN_UID=0`**, diagnóstico se o volume não for gravável e **`chmod`** permissivo no caminho de anexos quando o contentor arranca como root (evita `EACCES` em subpastas como `project-tasks` quando o `chown` não é aceite pelo driver do disco).
- Chamadas desde a app ao endpoint unificado **`/api/...`** (Next) para **calcular** ou **aprovar** medições e para **enviar anexos** de medições e glosas falhavam porque o despacho esperava mais segmentos de URL do que os que o Next expõe; o reconhecimento das rotas foi alinhado ao caminho real.

### Alterado

- Identidade visual e nomenclatura: substituição de BlueBeaver / «Gestão de Operações de TI» por **SIGTI — Sistema Integrado de Gestão de Tecnologia da Informação**, com a marca institucional da Prefeitura de Franca (login, menu, PWA, e-mails e títulos). Configuração centralizada em um único módulo de marca.
- `docker-compose.yml`: volume nomeado `gti_uploads` em `/app/apps/frontend/uploads` para persistência de anexos; o script de entrada ajusta dono/grupo antes de iniciar como utilizador `node`.
- Arranque em Docker/Railway: se existir **`RAILWAY_VOLUME_MOUNT_PATH`** (volume no serviço) e **`UPLOAD_ROOT`** não estiver definida, o entrypoint exporta **`UPLOAD_ROOT`** com esse caminho para a app gravar anexos no disco persistente.
- A tela de login foi redesenhada com identidade visual da BlueBeaver e textos voltados ao uso do sistema.
- O manual do produto deve ser atualizado junto com mudanças que impactem menus, fluxos da interface, permissões por papel ou formas de uso.
- Revisados textos da interface, mensagens de erro e documentação do produto para padronizar o português do Brasil.
- A lista de projetos passou a mostrar apenas as datas de início e fim planejado, sem barra visual de prazo.
- A tela de Funcionalidades passou a permitir ajuste de criticidade diretamente na linha do item, com seletor colorido do nível 1 (verde) ao nível 5 (vermelho).
- O cabeçalho dos contratos em Funcionalidades passou a mostrar um mini gráfico de requisitos cumpridos e os nomes do gestor e do fiscal do contrato.
- A tela de Fiscais e gestores passou a permitir editar nome, e-mail e telefone dos cadastros existentes.
- Fiscais e gestores agora podem ser vinculados opcionalmente a uma conta de usuário do sistema.
- O botão Relatórios foi removido temporariamente do menu principal.
- Em Minhas atribuições, os cartões do resumo levam à secção correspondente na mesma página (âncoras).
- Em Minhas atribuições, quando alguma lista atinge o limite de exibição (100 itens por tipo), aparece um aviso de truncagem.
- Em Minhas atribuições, o ícone de ajuda «Como apareço aqui?» explica os critérios pelos quais cada tipo de item é incluído na página.
- Em Minhas atribuições, foi incluída a opção «Ocultar secções sem itens», para reduzir rolagem quando há poucos tipos de atribuição ativos.
- Em Minhas atribuições, o estado aberto ou fechado da sanfona «Concluídas» nas tarefas de projeto é memorizado neste navegador.
- Em Minhas atribuições, tarefas de projeto pendentes com prazo ultrapassado aparecem destacadas como em atraso; cada linha pode indicar responsável interno e responsáveis externos (PMF), quando configurados.
- Ao abrir o detalhe de um projeto a partir de uma tarefa listada em Minhas atribuições, o URL pode incluir `#task-{identificador}` e a página faz scroll até a linha dessa tarefa no quadro assim que os dados estiverem carregados.
- Nos chamados de governança da mesma página, datas do SLA passam a ser mostradas com data e hora em português (Brasil).
- Quando um contrato não tem fiscal nem gestor definidos, a área correspondente sugere «Abrir meu perfil» para completar dados úteis ao vínculo.
- Em Minhas atribuições, «Tarefas de projetos» usa cabeçalhos com quantidades («Não concluídas (n)» e sanfona «Concluídas (n)»; mesmo critério de status que o quadro de projetos); no resumo do topo, o cartão dessas tarefas esclarece que o número é só de pendentes. A linha de atualização dos chamados GLPI mostra data e hora formatadas em português (Brasil).

### Como manter

- Registre apenas mudanças úteis para quem usa, administra ou opera o sistema.
- Agrupe os itens por `Adicionado`, `Alterado`, `Corrigido`, `Removido`, `Segurança` ou `Técnico`, conforme fizer sentido.
- Ao publicar uma versão, renomeie `Não publicado` para a data ou versão entregue, por exemplo `2026-04-27` ou `v1.2.0`, e abra uma nova seção `Não publicado` no topo.
