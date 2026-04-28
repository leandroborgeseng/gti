# Notas de versão

Este arquivo resume, em linguagem para usuários, as mudanças relevantes entre versões do sistema.

## Não publicado

### Adicionado

- Criada a rotina de manutenção das notas de versão para registrar mudanças funcionais, melhorias de interface, alterações de permissões e ajustes relevantes para operação.
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

### Alterado

- A tela de login foi redesenhada com identidade visual da BlueBeaver e textos voltados ao uso do sistema.
- O manual do produto deve ser atualizado junto com mudanças que impactem menus, fluxos da interface, permissões por papel ou formas de uso.
- Revisados textos da interface, mensagens de erro e documentação do produto para padronizar o português do Brasil.
- A lista de projetos passou a mostrar apenas as datas de início e fim planejado, sem barra visual de prazo.
- A tela de Funcionalidades passou a permitir ajuste de criticidade diretamente na linha do item, com seletor colorido do nível 1 (verde) ao nível 5 (vermelho).
- O cabeçalho dos contratos em Funcionalidades passou a mostrar um mini gráfico de requisitos cumpridos e os nomes do gestor e do fiscal do contrato.
- A tela de Fiscais e gestores passou a permitir editar nome, e-mail e telefone dos cadastros existentes.
- Fiscais e gestores agora podem ser vinculados opcionalmente a uma conta de usuário do sistema.
- O botão Relatórios foi removido temporariamente do menu principal.
- Adicionada a tela Minhas atribuições para o usuário acompanhar chamados, tarefas, projetos, contratos e módulos vinculados a ele.

### Como manter

- Registre apenas mudanças úteis para quem usa, administra ou opera o sistema.
- Agrupe os itens por `Adicionado`, `Alterado`, `Corrigido`, `Removido`, `Segurança` ou `Técnico`, conforme fizer sentido.
- Ao publicar uma versão, renomeie `Não publicado` para a data ou versão entregue, por exemplo `2026-04-27` ou `v1.2.0`, e abra uma nova seção `Não publicado` no topo.
