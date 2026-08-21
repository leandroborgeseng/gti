/**
 * Manual do usuário (texto apresentado em `/manual`).
 * Ao alterar menus, fluxos ou permissões da interface, atualize este arquivo
 * e incremente `MANUAL_LAST_UPDATED` (data ISO YYYY-MM-DD).
 */

export const MANUAL_LAST_UPDATED = "2026-08-21"; // Central Documentos interna + renovação/PDF/consumos

/** Segmento de parágrafo: texto simples ou hiperligação interna. */
export type ManualPart = string | { href: string; label: string };

export type ManualBlock =
  | { kind: "p"; parts: ManualPart[] }
  | { kind: "ul"; items: string[] }
  | { kind: "tip"; text: string }
  | { kind: "roles"; text: string };

export type ManualSection = {
  id: string;
  title: string;
  blocks: ManualBlock[];
  children?: ManualSection[];
};

export const MANUAL_SECTIONS: ManualSection[] = [
  {
    id: "introducao",
    title: "Introdução",
    blocks: [
      {
        kind: "p",
        parts: [
          "O SIGTI · Sistema Integrado de Gestão de Tecnologia da Informação reúne a gestão contratual, medições financeiras, glosas, prazos e pendências, ligação a chamados GLPI, governança de SLA, metas, projetos e relatórios. O objetivo é dar visibilidade à operação e ao cumprimento contratual em um único painel."
        ]
      },
      {
        kind: "p",
        parts: [
          "Utilize o menu lateral (ou o menu móvel) para mudar de área. Em várias listagens existe pesquisa e filtros; nas páginas de detalhe, links de retorno à lista aparecem no topo."
        ]
      },
      {
        kind: "p",
        parts: [
          "Na barra superior da área autenticada, use os botões ",
          { href: "/manual", label: "Manual" },
          " e ",
          { href: "/notas-versao", label: "Notas de versão" },
          " para consultar ajuda e mudanças recentes do sistema. Use ",
          { href: "/perfil", label: "Meu perfil" },
          " para definir nome, sobrenome, cargo/função, setor/unidade, telefone/ramal e a cor que identificam você nas telas do sistema."
        ]
      },
      {
        kind: "p",
        parts: [
          "Quando uma nova versão for publicada, o sistema exibirá um aviso na área autenticada com o botão «Atualizar agora». Use esse botão para recarregar o PWA e garantir que está usando a versão mais recente."
        ]
      },
      {
        kind: "tip",
        text: "Se algo não carregar, verifique a sessão (voltar a entrar) e, em caso de erro persistente, contate a equipe de suporte com o texto do erro apresentado na tela."
      }
    ]
  },
  {
    id: "perfis",
    title: "Perfis de acesso",
    blocks: [
      {
        kind: "p",
        parts: [
          "O acesso é definido por perfis (Administrador, Editor, Leitor e perfis customizados) e por órgãos. Um usuário pode ter vários perfis e vários órgãos, ou a abrangência «Todos os órgãos». No topo da área autenticada, o seletor de contexto (ao lado de «Meu perfil») mostra o perfil e o órgão ativos e permite trocar; menus, operações e o filtro de contratos/medições/glosas seguem esse contexto. Com um órgão específico ativo, mesmo o perfil Administrador vê só dados daquele órgão; com «Todos os órgãos», não há filtro de órgão. As permissões efetivas são as do perfil ativo somadas às permissões adicionais daquele perfil para o usuário."
        ]
      },
      {
        kind: "roles",
        text: "A página de exportações CSV e algumas ações de escrita dependem das permissões do perfil ativo; perfis só de leitura não alteram dados sensíveis."
      },
      {
        kind: "p",
        parts: [
          "Contas do tipo ",
          "Externo",
          " (empresa contratada) usam o perfil protegido «Usuário externo» e não recebem órgãos internos. Após o login, o menu mostra apenas Meus contratos, Notificações, Cronogramas, Documentos e Meu perfil, limitados aos contratos autorizados pela Administração."
        ]
      }
    ]
  },
  {
    id: "portal-externo-notificacoes",
    title: "Portal da empresa e notificações",
    blocks: [
      {
        kind: "p",
        parts: [
          "Usuários externos acessam ",
          { href: "/externo/notificacoes", label: "Notificações" },
          " para ler comunicados formais, dar ciência e enviar manifestações quando exigido. Se houver itens vinculados à notificação, a empresa também indica status e justificativa por item. Análises internas feitas pela fiscalização não são exibidas para a empresa."
        ]
      },
      {
        kind: "p",
        parts: [
          "Na ficha do contrato (usuários internos), a seção Notificações permite criar a partir de um modelo, revisar, assinar com senha do SIGTI e enviar por e-mail. Em Administração → Modelos de notificação, cadastre os textos-base com campos de mala direta. A Central de Documentos (`/documentos` para internos e `/externo/documentos` para a empresa) lista notificações formalizadas com filtros rápidos."
        ]
      },
      {
        kind: "tip",
        text: "O documento assinado pode ser impresso em HTML ou baixado como PDF gerado a partir do mesmo HTML (quando o ambiente tiver Chromium; senão, há fallback em texto). Novos documentos usam numeração DOC-SIGTI-####/AAAA (números NOT-SIGTI antigos continuam válidos), com código verificador, código de validação e QR Code apontando para /validar-documento. Nenhum destes substitui assinatura com certificado digital ICP-Brasil."
      }
    ]
  },
  {
    id: "painel",
    title: "Painel executivo",
    blocks: [
      {
        kind: "p",
        parts: [
          { href: "/dashboard", label: "Painel executivo" },
          " · Indicadores resumidos (financeiros, chamados, alertas) para acompanhamento rápido da situação global. Os mesmos dados aparecem também na área de ",
          { href: "/reports", label: "Relatórios" },
          ", com contexto de exportações."
        ]
      }
    ]
  },
  {
    id: "prazos-pendencias",
    title: "Prazos e pendências",
    blocks: [
      {
        kind: "p",
        parts: [
          { href: "/prazos-pendencias", label: "Prazos e pendências" },
          " · Painel consolidado de prazos e alertas materializados a partir de vigências de contratos, marcos de cronograma, ocorrências com prazo de regularização, medições do mês ainda não aprovadas e funcionalidades pendentes de validação. Use os cartões do topo para ver totais e a lista abaixo para filtrar por tipo, situação, nível de atenção ou texto."
        ]
      },
      {
        kind: "ul",
        items: [
          "Cada linha mostra o prazo, a situação (futuro, próximo, vence hoje, atrasado etc.), o tipo de origem e o responsável, com atalho para abrir o contrato, a medição ou as funcionalidades relacionadas.",
          "Funcionalidades não entregues ou parciais geram alertas para os membros do grupo de validação e para responsáveis específicos do item. Quem acompanha o módulo recebe um único alerta consolidado por módulo, não um por funcionalidade.",
          "A listagem respeita o órgão do contexto ativo (seletor no topo). Com «Todos os órgãos», vê o conjunto completo ao qual tem acesso.",
          "Administradores podem usar «Recalcular prazos» para atualizar a materialização a partir das fontes atuais. Nesta versão não há envio automático de e-mail de alerta."
        ]
      },
      {
        kind: "roles",
        text: "Visualização exige a permissão «Visualizar prazos e pendências». O recálculo exige «Recalcular prazos e alertas» (perfil Administrador por padrão)."
      }
    ]
  },
  {
    id: "chamados",
    title: "Chamados (GLPI)",
    blocks: [
      {
        kind: "p",
        parts: [
          { href: "/chamados", label: "Chamados (GLPI)" },
          " · Quadro tipo Kanban com chamados sincronizados a partir do GLPI. É mostrada uma faixa com **quando foi a última sincronização** bem-sucedida (ou última tentativa); administradores e editores podem **sincronizar agora**, pedindo atualização imediata do cache. No topo há dois painéis sobre o stock aberto com os filtros atuais: idade desde a abertura e tempo desde a última alteração vista no GLPI (proxy de «última interação» no ticket); em cada faixa pode clicar para filtrar o quadro. Também pode filtrar por texto, estado, grupo, pendência inferida, técnico atribuído e outras opções. Serve à operação diária (quem trata o quê) e complementa a visão por contrato nas ligações GLPI do detalhe do contrato."
        ]
      },
      {
        kind: "tip",
        text: "A sincronização com o GLPI depende da configuração do servidor e da banco de dados; se o quadro estiver vazio ou com erro, o problema é técnico de ligação, não da sua conta."
      }
    ]
  },
  {
    id: "resumo-operacional",
    title: "Resumo operacional",
    blocks: [
      {
        kind: "p",
        parts: [
          { href: "/resumo-operacional", label: "Resumo operacional" },
          " · Visão diária, semanal ou mensal da produção da equipe, reunindo chamados GLPI abertos e fechados, tarefas de projetos concluídas, mudanças relevantes em contratos e o acesso ao relatório administrativo de uso do sistema por usuário."
        ]
      },
      {
        kind: "ul",
        items: [
          "Use os filtros Hoje, Ontem, Últimos 7 dias e Últimos 30 dias para acompanhar rapidamente o que foi produzido.",
          "Os chamados GLPI são lidos do cache sincronizado; para fechamentos, o sistema usa o status do chamado e a data de modificação registrada no cache.",
          "Eventos internos, como conclusão de tarefas e alterações em contratos, passam a ser registrados a partir desta versão."
        ]
      }
    ]
  },
  {
    id: "minhas-atribuicoes",
    title: "Minhas atribuições",
    blocks: [
      {
        kind: "p",
        parts: [
          { href: "/minhas-atribuicoes", label: "Minhas atribuições" },
          " · Janela única para o usuário logado acompanhar chamados GLPI, tarefas de projetos, projetos supervisionados, contratos como fiscal ou gestor, funcionalidades pendentes sob sua responsabilidade, módulos sob seu acompanhamento e chamados de governança vinculados ao seu usuário."
        ]
      },
      {
        kind: "ul",
        items: [
          "Os números do resumo no topo são clicáveis e levam à secção correspondente na mesma página. Há totais separados para funcionalidades pendentes e módulos sob acompanhamento.",
          "«Funcionalidades pendentes sob minha responsabilidade» lista itens não entregues ou parciais em que você é membro do grupo de validação ou responsável específico (acompanhamento de módulo sozinho não conta neste total).",
          "«Módulos sob seu acompanhamento» lista módulos em que você é fiscal/responsável de acompanhamento.",
          "Use «Ocultar secções sem itens» para esconder blocos vazios e reduzir rolagem.",
          "O ícone de ajuda «Como apareço aqui?» resume os critérios de inclusão de cada tipo de item.",
          "Se alguma lista tiver mais entradas do que o limite exibido na página (100 por tipo), aparece um aviso de truncagem.",
          "Nas tarefas de projeto, «Não concluídas» mostra a quantidade de pendentes; pendentes em atraso ficam destacadas. As concluídas ficam na sanfona «Concluídas»; abrir ou fechar essa sanfona é lembrado neste navegador. No resumo, o cartão «Tarefas de projeto» refere-se só às pendentes. Cada linha pode mostrar responsável interno e responsáveis externos (PMF), quando existirem.",
          "Ao abrir um projeto a partir de uma tarefa, o link pode incluir `#task-…` no final do endereço; na página do projeto, o quadro de tarefas rola até essa linha depois de carregar.",
          "Nos chamados GLPI e na governança, datas relevantes aparecem em português com data e hora quando aplicável."
        ]
      },
      {
        kind: "tip",
        text: "Para contratos aparecerem nesta tela, o cadastro de Fiscal/Gestor precisa estar vinculado ao usuário correspondente. Se o contrato ainda não tiver fiscal nem gestor definidos, pode usar «Abrir meu perfil» para completar dados úteis ao vínculo."
      }
    ]
  },
  {
    id: "contratos",
    title: "Contratos",
    blocks: [
      {
        kind: "p",
        parts: [
          { href: "/contracts", label: "Contratos" },
          " · Lista dos contratos. Abra um contrato para ver dados cadastrais (vigência, valores, fornecedor, fiscal, gestor, legislação, tipo), alterar estado quando permitido, e gerenciar blocos específicos."
        ]
      },
      {
        kind: "ul",
        items: [
          "Lista: a pesquisa também localiza o código interno SIGTI, a identificação formal, o processo administrativo, o nome e o fornecedor.",
          "Vigência: datas de início e fim; período de implantação opcional para o painel de proporcionalidade.",
          "Número formal: a identificação é formada pelo número e pelo ano da data de início (por exemplo, 0156/2026). O mesmo número formal não pode ser cadastrado mais de uma vez no mesmo ano.",
          "Código interno: administradores com a permissão específica podem usar «Regenerar código interno» no modal Editar (junto ao campo Código interno SIGTI), apenas em situações excepcionais. É obrigatório justificar a emissão; o código anterior permanece no histórico e o novo código recebe outro sequencial.",
          "Excluir contrato: disponível apenas para administradores, no topo do detalhe. Exige digitar EXCLUIR ou o número do contrato e uma justificativa. Só funciona para cadastros sem medições, aditivos, chamados de governança ou funcionalidades já avaliadas; nos demais casos, altere o status para Suspenso ou Encerrado.",
          "Itens contratuais: na criação e na edição, registre quantos itens forem necessários (mensalidade, implantação, horas de desenvolvimento ou suporte, treinamentos, UST, equipamentos, licenças, locações, infraestrutura, materiais e outros). Cada item tem sequência, tipo padronizado (lista da Administração), descrição contratual livre (texto do edital/TR/proposta), unidade de medida, quantidade, valor unitário e valor total (calculado automaticamente; valor manual exige justificativa se divergir). Itens recorrentes pedem periodicidade e período de incidência; marque «Base de glosa» nas mensalidades que devem compor a referência das medições de funcionalidades. Sob demanda registram o teto contratado (consumo controlado depois); valores únicos não exigem periodicidade. Ao final da seção aparecem os totais recorrente, único, sob demanda e global estimado. Com medições ou aditivos, o item não é excluído - apenas cancelado.",
          "Valor global: a seção própria mostra a estimativa calculada pelos itens. Em caso excepcional, marque «Ajuste manual excepcional», informe o valor global e justifique a divergência. O detalhe do contrato identifica esse ajuste e preserva o valor global original para conferência.",
          "Arquivos: na aba «Arquivos», anexe documentos originais do contrato (contrato, termo de referência, edital, aditivos etc.), com tipo documental, título, data e arquivo. A lista é paginada e filtrável; quem tem permissão de edição envia, cancela ou inativa (com justificativa); qualquer usuário com visualização de contratos pode descarregar.",
          "Proporção de implantação por funcionalidade: repartição do valor de implantação alinhada às funcionalidades do contrato.",
          "Grupos GLPI: associação de grupos do GLPI ao contrato, para cruzar chamados e métricas.",
          "Chamados GLPI: no detalhe do contrato, lista os chamados em cache vinculados aos grupos associados. Filtre por situação, prioridade, período de abertura e, quando o dado existir no cache, por SLA atrasado. A faixa indica a última sincronização com o GLPI; o botão «Abrir» leva ao chamado no GLPI quando a URL pública estiver configurada. A coluna «Classificação» grava no SIGTI (corretivo, evolutivo, suporte etc.) e não altera o GLPI.",
          "Aditivos, reajustes e histórico: na ficha do contrato, registre termos aditivos, reajustes, repactuações e demais alterações com tipo, referência do instrumento, data de formalização, início dos efeitos, novo término (opcional) e descrição/observação obrigatória. Selecione os itens contratuais afetados para informar novos valores, percentual de reajuste/acréscimo/supressão ou incluir um item novo; a supressão encerra a vigência do item (não o apaga). Antes de confirmar, confira o resumo comparativo (antes/depois, diferença em R$ e %). Os valores passam a valer a partir da data de início dos efeitos e o valor global vigente é recalculado pela composição dos itens (o valor global original é preservado). A mesma seção mostra o histórico automático (contratação original + cada aditivo), com detalhe expansível dos itens; não há edição/exclusão comum — apenas cancelamento formal com justificativa. Com medições ou aditivos, a edição direta dos itens de precificação fica bloqueada: alterações financeiras devem seguir por aditivo.",
          "Cronogramas e marcos: na ficha do contrato, registre cronogramas operacionais (implantação, migração, treinamento, plano de ação etc.) com tipo, origem, finalidade, datas previstas, responsáveis internos, responsáveis da empresa (texto livre), situação, versão e observações. Inclua etapas/marcos com sequência, atividade, datas previstas e efetivas, percentual e dependências; dá para vincular opcionalmente a um item contratual ou a uma funcionalidade. Rascunho edita livremente; depois de aprovado, mudanças de datas, etapas ou responsáveis geram nova versão (a anterior fica «Substituído»). A aprovação é operacional e não substitui aditivo. Ao expandir um cronograma, envie anexos (PDF, imagens, planilhas etc.) no mesmo padrão das medições.",
          "Ocorrências: na ficha do contrato, registre fatos como não conformidade, atraso ou descumprimento de SLA, com tipo, origem, título, descrição, data da constatação, gravidade, responsável interno, prazo de regularização, situação, conclusão e evidências em texto. Dá para informar vínculos opcionais (IDs) a itens, funcionalidades, medições, glosas ou cronogramas. A mudança de situação pede justificativa e entra na linha do tempo. Não há notificação automática nesta versão.",
          "Controladoria: quem tiver a permissão «Encaminhar e acompanhar casos na Controladoria» (ou administrador com edição de contratos) pode, a partir de uma ocorrência, abrir um dossiê com justificativa, resumo e providências sugeridas. A ocorrência permanece no contrato; o caso guarda um snapshot consolidado e campos de acompanhamento do processo (incluindo número e link SEI para uso futuro). Há também uma listagem simples na Administração → Controladoria.",
          "Grupos de validação: na ficha do contrato, cadastre grupos com nome, descrição opcional e responsáveis (usuários do sistema, inclusive de outros órgãos). Cada funcionalidade nova deve estar vinculada a um grupo ativo. Grupos com funcionalidades vinculadas não são excluídos — apenas inativados.",
          "Estrutura do contrato (funcionalidades / entregáveis): edição da composição do contrato quando a sua função o permitir. Cada módulo tem uma sanfona para mostrar ou ocultar suas funcionalidades, facilitando a navegação em contratos extensos. Use os filtros por status de entrega, criticidade e texto para localizar itens por Código do Item ou descrição dentro dos respectivos módulos. No topo do módulo aparecem total de itens, entregues, parciais, não entregues e responsáveis pelo acompanhamento. Em contratos de software e serviço, selecione também a «Base de glosa (item contratual)» para cada módulo quando as mensalidades precisarem ser calculadas separadamente; ao existir pelo menos um vínculo, somente os módulos vinculados entram nesse cálculo, evitando duplicidade. O campo Código do Item é obrigatório e deve guardar a numeração do item no Termo de Referência, mantendo o nome/descrição sem o número embutido; se ficar vazio, o campo é destacado e o sistema mostra um aviso antes de salvar. A criticidade de módulos e funcionalidades define automaticamente os pesos proporcionais usados nos reflexos financeiros: Crítica = 5, Alta = 4, Média = 3, Baixa = 2 e Apoio = 1. A opção «Não se aplica» (peso 0) serve para títulos, seções e textos organizacionais: o item permanece visível, mas fica fora do percentual de cumprimento e dos valores proporcionais.",
          "Fiscais / responsáveis pelo acompanhamento do módulo: acompanham o módulo, mas não são automaticamente responsáveis diretos de cada funcionalidade. Podem validar itens do módulo quando tiverem permissão de edição de entrega.",
          "Grupo de validação na funcionalidade: obrigatório em novos itens. Itens legados sem grupo aparecem como «Grupo não definido». Os membros do grupo são os responsáveis efetivos; responsáveis específicos do item complementam (não substituem) o grupo. Na importação por planilha, use a coluna opcional grupo_validacao (nome do grupo já cadastrado); se omitida, o item fica como «Grupo não definido» e pode ser atribuído depois (há aviso no resumo da importação).",
          "Histórico auditável dos itens: na aba Auditoria do contrato, consulte quem inseriu, excluiu ou alterou módulos, funcionalidades, grupos de validação e serviços (antes/depois de Código do Item, descrição, criticidade, estado e entrega). A lista é paginada no servidor (10, 25, 50 ou 100 por página), com filtros por período, autor, tipo de item, ação e busca textual."
        ]
      },
      {
        kind: "p",
        parts: [
          "A partir do detalhe, pode ir para ",
          { href: "/measurements", label: "Medições" },
          " já filtradas por esse contrato."
        ]
      }
    ]
  },
  {
    id: "funcionalidades",
    title: "Funcionalidades",
    blocks: [
      {
        kind: "p",
        parts: [
          { href: "/modulos", label: "Funcionalidades" },
          " · Visão das funcionalidades contratuais e respectivos estados de entrega / acompanhamento, alinhadas à estrutura definida nos contratos. A lista começa só com resumos: expandir o contrato carrega os módulos; expandir o módulo carrega a primeira página de itens (use «Carregar mais» se houver continuidade). Os filtros por texto, status de entrega, criticidade e atribuição (todos, atribuídos a mim, sou responsável pelo grupo, sou responsável pelo módulo, sem responsável) pesquisam no servidor e mostram os contratos correspondentes já abertos. Cada item indica visualmente o motivo da atribuição (grupo, específico ou acompanhamento de módulo). Se você for membro de grupo/item/módulo de outro órgão, esses contratos também entram na listagem. Cada funcionalidade deve ter Código do Item separado do nome, para guardar a numeração do Termo de Referência; se o código obrigatório não for preenchido, o campo fica vermelho e o sistema mostra um aviso antes de salvar. A criticidade aparece em um seletor colorido na linha do item, do nível 1 (Apoio, verde) ao nível 5 (Crítica, vermelho), além de «Não se aplica» (fora do cálculo), e recalcula automaticamente os pesos de todas as funcionalidades do módulo sempre que um item é incluído, excluído ou alterado. Ao alterar o estado de entrega para «Entregue», informe a data efetiva da entrega; em «Parcialmente entregue», informe a data e o percentual acumulado (5% a 95%, de 5 em 5). Cada registro entra no histórico temporal da funcionalidade. No cabeçalho do contrato aparecem o mini gráfico de requisitos cumpridos, o gestor e o fiscal; no cabeçalho do módulo, as contagens de entregues / parciais / não entregues. Os seletores de entrega e criticidade só aparecem para quem possui a permissão específica de cada ação; editar a estrutura exige permissão de edição de contratos e «Abrir contrato» exige permissão de visualização. Quem não tiver essas permissões apenas consulta."
        ]
      }
    ]
  },
  {
    id: "medicoes",
    title: "Medições",
    blocks: [
      {
        kind: "p",
        parts: [
          { href: "/measurements", label: "Medições" },
          " · Uma medição por contrato e por competência (mês/ano). Cada registro percorre estados: Aberta → Em revisão ou Glosada → Aprovada. O valor aprovado consolida o que conta como medição aprovada para relatórios."
        ]
      },
      {
        kind: "ul",
        items: [
          "Utilize «Nova medição» para abrir a competência (mês/ano). Só pode existir uma medição ativa por contrato e competência.",
          "Ao criar, o sistema monta automaticamente as linhas a partir dos itens contratuais vigentes (total ou parcialmente) na competência. Se um aditivo mudar o item no meio do mês, surgem linhas separadas com o período de cada versão. Contratos sem itens vigentes e sem valor mensal legado não permitem criar a medição.",
          "Itens recorrentes entram com valor proporcional aos dias de vigência no mês; sob demanda e pagamento único pedem quantidade (ou percentual) informada antes ou depois do primeiro cálculo. Use «Calcular medição» para preencher valores e gerar glosas automáticas por funcionalidades não validadas, quando aplicável. A glosa automática é rateada proporcionalmente ao valor bruto de cada linha da medição.",
          "Na seção «Glosas e descontos» da medição, registre glosas manuais com justificativa obrigatória. Glosas automáticas não têm valor editável. O resumo mostra bruto, glosas automáticas, manuais e líquido (≥ 0). Após aprovar, a medição fica congelada.",
          "Após «Calcular medição», a seção «Memória de saldo e entrega» mostra a data de corte, o saldo por item (contratado → já medido → saldo → consumo não medido → medição atual) e o snapshot das funcionalidades nessa data. Com a medição aprovada, essa memória permanece como registro histórico.",
          "Em contratos de datacenter ou infraestrutura, ainda é possível acrescentar linhas de consumo por serviço enquanto a medição estiver aberta. Para itens sob demanda, o sistema não permite medir ou aprovar quantidade acima do saldo disponível.",
          "Os anexos da medição permitem pré-visualizar PDF e imagens; administradores e editores podem eliminar um anexo (com confirmação)."
        ]
      },
      {
        kind: "p",
        parts: [
          "O ",
          { href: "/reports/fechamento-mensal", label: "relatório de fechamento mensal" },
          " cruza contratos vigentes com a medição do mês, referência do mês anterior (quando há medição aprovada), e estatísticas de ordens de serviço GLPI (abertas, fechadas e represadas) por contrato. O ",
          { href: "/reports/itens-contratuais", label: "relatório financeiro por item contratual" },
          " mostra os valores, consumos, saldos e total medido de cada item, com filtros por órgão, situação e competência (mês/ano) do valor medido."
        ]
      }
    ]
  },
  {
    id: "glosas",
    title: "Glosas",
    blocks: [
      {
        kind: "p",
        parts: [
          { href: "/glosas", label: "Glosas" },
          " · Consulta consolidada das glosas geradas nas medições (automáticas e manuais). Novas glosas adicionais são registradas na própria tela da medição, na seção «Glosas e descontos».",
          " Os anexos da glosa seguem o mesmo padrão que na medição: pré-visualização de PDF/imagem num modal quando aplicável e possibilidade de remover (papéis com permissão de edição)."
        ]
      }
    ]
  },
  {
    id: "governanca",
    title: "Governança SLA",
    blocks: [
      {
        kind: "p",
        parts: [
          { href: "/governance/tickets", label: "Governança SLA" },
          " · Chamados com foco em cumprimento de SLA e papéis de governança (gestor, controladoria, observador). Utilize filtros e o detalhe de cada chamado para acompanhar prazos e responsabilidades."
        ]
      }
    ]
  },
  {
    id: "metas",
    title: "Metas estratégicas",
    blocks: [
      {
        kind: "p",
        parts: [
          { href: "/goals", label: "Metas" },
          " · Definição e acompanhamento de metas. No detalhe da meta, registre em texto exatamente o que ela representa e escolha se ela fica vinculada a um projeto inteiro ou a tarefas específicas. As tarefas vinculadas podem pertencer a projetos diferentes; use os filtros por projeto, responsável e texto para localizar as tarefas antes de vinculá-las."
        ]
      }
    ]
  },
  {
    id: "projetos",
    title: "Projetos",
    blocks: [
      {
        kind: "p",
        parts: [
          { href: "/projetos", label: "Projetos" },
          " · Projetos e iniciativas. Administradores e editores podem criar grupos de projetos, cadastrar projetos vazios, editar nome, contexto, supervisor, data de início, fim planejado e grupo dos projetos existentes, criar, editar e excluir tarefas manualmente, adicionar comentários no histórico de cada tarefa, anexos às tarefas (através do ícone de clipe na linha ou no quadro), com o mesmo comportamento de modal de pré-visualização e remoção de ficheiros, ou importar tarefas por Excel do Monday.com. O detalhe do projeto mostra as metas vinculadas ao projeto inteiro; nas tarefas, além de Pessoa e Responsável PMF, é possível selecionar uma meta e informar o número do chamado GLPI quando aquela tarefa estiver ligada a um atendimento. O supervisor é a pessoa responsável por acompanhar os status das tarefas e conferir se elas foram executadas. O contexto funciona como apresentação do projeto: explica o que ele faz, por que existe e quais pontos são importantes para acompanhar. A lista de projetos e os grupos mostram um mini resumo de execução com percentual concluído, andamento, bloqueios e atrasos; na linha de cada projeto aparecem as datas de início e fim planejado. A lista agrupada por sanfonas ajuda a acompanhar os projetos por grupo. Pode existir uma vista de ",
          { href: "/projetos/tarefas", label: "tarefas" },
          " para trabalho transversal. Abra um projeto para ver contexto, fases, tarefas e informação associada."
        ]
      }
    ]
  },
  {
    id: "fornecedores-fiscais",
    title: "Fornecedores e fiscais",
    blocks: [
      {
        kind: "p",
        parts: [
          { href: "/suppliers", label: "Fornecedores" },
          " · Cadastro e edição de empresas fornecedoras utilizadas nos contratos. Informe contatos de e-mail opcionais (usados no envio de notificações). A lista mostra os contratos vinculados a cada fornecedor; clique em um contrato para abrir o detalhe.",
          " ",
          { href: "/fiscais", label: "Fiscais" },
          " · Cadastro e edição de fiscais e gestores do contrato. Ambos alimentam campos de seleção no detalhe do contrato e podem, opcionalmente, ser vinculados a uma conta de usuário do sistema."
        ]
      }
    ]
  },
  {
    id: "exportacoes",
    title: "Exportações",
    blocks: [
      {
        kind: "p",
        parts: [
          { href: "/exports", label: "Exportações" },
          " · Download de arquivos CSV (contratos, medições, glosas, aditivos) em UTF-8, para arquivo ou análise externa."
        ]
      },
      {
        kind: "roles",
        text: "Reservado a usuários com perfil de edição ou administração (não aparece no menu para leitores)."
      }
    ]
  },
  {
    id: "relatorios",
    title: "Relatórios",
    blocks: [
      {
        kind: "p",
        parts: [
          { href: "/reports", label: "Relatórios" },
          " · Hub com o painel resumido e link para o fechamento mensal. O botão foi removido temporariamente do menu principal, mas a rota pode ser acessada diretamente quando necessário. O fechamento mensal mostra, por contrato e mês selecionado, referência da medição anterior, estado da medição da competência, valores aprovados quando aplicável, e contagens GLPI incluindo ordens represadas de meses anteriores."
        ]
      }
    ]
  },
  {
    id: "administracao",
    title: "Administração",
    blocks: [
      {
        kind: "p",
        parts: [
          { href: "/administracao", label: "Administração" },
          " · Área unificada para administradores, com abas para usuários, órgãos, permissões, modelos de notificação, tipos de itens/contrato/contratação, conferência de precificação, Controladoria, configuração de e-mail, auditoria e logs, e atalho para backup. A rota antiga ",
          { href: "/administracao?tab=usuarios", label: "/users" },
          " redireciona para a aba Usuários."
        ]
      },
      {
        kind: "ul",
        items: [
          "Usuários: gestão de contas internas ou externas (empresa), perfis, órgãos (ou «Todos os órgãos»), aprovação de cadastros e senha inicial.",
          "Modelos de notificação: textos-base com mala direta; inative em vez de excluir se já foram usados.",
          "Órgãos: cadastro de secretarias/unidades com nome, sigla, código e status ativo/inativo.",
          "Permissões: cadastre perfis, edite a matriz por perfil e, no modo por usuário, escolha o perfil vinculado para ver herdadas e adicionais. As permissões de gerir usuários e gerir permissões permanecem obrigatórias no perfil Administrador. Consulte o histórico das últimas alterações.",
          "Usuários: o sistema não permite remover o último administrador aprovado capaz de gerir usuários e permissões.",
          "Tipos de itens, contrato e contratação: catálogos usados nos formulários de contrato.",
          "Conferência precificação: valida os contratos ativos migrados dos campos antigos de mensalidade e implantação para itens contratuais. Use os filtros para localizar pendências, duplicidade de mensalidades, quantidades ou períodos a revisar e divergências de valores; cada linha abre o contrato para correção.",
          "Controladoria: listagem simples dos dossiês encaminhados a partir de ocorrências contratuais, com atalho para o contrato. O acompanhamento detalhado do processo fica na ficha do contrato.",
          "Configuração de e-mail: defina o servidor SMTP de saída, remetente, cópias e padrões; teste o envio e consulte o histórico mínimo. A senha é guardada criptografada e não é exibida depois de salva. A caixa de entrada (IMAP) ainda não está disponível. Com SMTP ativo e credencial, recuperação de senha e boas-vindas usam esse canal; caso contrário, o sistema usa o Resend quando configurado.",
          "Auditoria e logs: na mesma aba, configure quais eventos gravar (por módulo, com pesquisa e restauração do padrão) e consulte os registros paginados com filtros, detalhe e exportação CSV. Em Armazenamento e retenção, veja indicadores de volume, configure prazos por categoria (descarte desligado por padrão) e, após validação da área competente, simule ou execute o descarte. Não há exclusão seletiva por conteúdo na consulta de logs.",
          "Backup: botão que abre a tela completa de exportação, restauração e S3 em /backup."
        ]
      },
      {
        kind: "roles",
        text: "Menu «Administração» só é mostrado a administradores."
      }
    ]
  },
  {
    id: "usuários",
    title: "Usuários",
    blocks: [
      {
        kind: "p",
        parts: [
          { href: "/administracao?tab=usuarios", label: "Usuários" },
          " · Gestão de contas, perfis, órgãos, aprovação de cadastros e senha inicial. Disponível na aba Usuários da Administração."
        ]
      },
      {
        kind: "ul",
        items: [
          "Ao criar ou editar, escolha tipo Interno ou Externo. Internos: vincule ao menos um perfil e (órgão ou «Todos os órgãos»). Externos: fornecedor, função e contratos autorizados do mesmo CNPJ (sem órgãos internos).",
          "Ao criar uma conta ou redefinir a senha de um usuário pela administração, o sistema exige que a pessoa troque a senha no primeiro acesso. Após o login com a senha provisória, a sessão fica restrita à tela «Trocar senha obrigatória» (nova senha + confirmação, sem repetir a provisória). Concluída a troca, o acesso ao SIGTI é liberado sem novo login.",
          "Na tela de login, use o link «Solicitar acesso» para abrir a tela própria de cadastro inicial (nome completo, CPF, e-mail e tipo Interno/Externo). Internos escolhem o órgão; externos escolhem a empresa e o vínculo. A solicitação fica pendente até um administrador aprovar ou recusar (com justificativa) na Administração → Usuários, onde também completa perfis, órgãos ou contratos autorizados.",
          "Ao criar uma conta, o sistema pode enviar um e-mail de boas-vindas com link para definição de senha (SMTP institucional ativo ou Resend). Se a senha for definida por esse link, a troca obrigatória é considerada concluída.",
          "Na tela de login, a opção «Esqueci a minha senha» envia um link de redefinição para o e-mail cadastrado (mesmo canal unificado). O link expira em 60 minutos."
        ]
      },
      {
        kind: "roles",
        text: "Disponível na aba Usuários da Administração (menu «Administração»)."
      }
    ]
  },
  {
    id: "backup-migracao",
    title: "Backup e migração",
    blocks: [
      {
        kind: "p",
        parts: [
          { href: "/backup", label: "Backup e migração" },
          " · Permite a administradores exportar e restaurar a base de dados PostgreSQL, preferências guardadas no sistema e, opcionalmente, os anexos em disco. Também acessível pela aba Backup em ",
          { href: "/administracao?tab=backup", label: "Administração" },
          ". Serve para migrar a aplicação para outro servidor (por exemplo Railway → Coolify)."
        ]
      },
      {
        kind: "ul",
        items: [
          "Na exportação, o sistema gera um ficheiro .tar.gz com o dump da base (pg_dump), um manifesto e uma checklist de variáveis de ambiente. Os valores secretos (JWT, senhas GLPI, chaves Resend, etc.) nunca entram no pacote.",
          "Pode incluir ou omitir a pasta de anexos (medições, glosas e tarefas de projeto).",
          "Backup automático S3: configure bucket, chaves, horário e retenção (diária / semanal / mensal) na própria tela. O secret fica criptografado na base; o envio corre todos os dias no horário escolhido e pode ser disparado manualmente.",
          "É possível listar os pacotes no S3 e restaurar um deles neste servidor (com a palavra RESTAURAR), além da restauração a partir de um ficheiro local.",
          "Na restauração por ficheiro, escolha o arquivo no servidor de destino, indique se quer restaurar anexos e digite a palavra RESTAURAR para confirmar. Esta operação substitui os dados da base atual.",
          "Depois da restauração, confirme no painel do host que as variáveis de ambiente necessárias estão definidas (a tela mostra quais estão presentes ou em falta, sem revelar valores).",
          "Faça a restauração em janela de manutenção: utilizadores ligados podem precisar de voltar a autenticar-se."
        ]
      },
      {
        kind: "tip",
        text: "Para migrações operacionais pela linha de comando, continue a poder usar os scripts scripts/db-export.sh e scripts/db-import.sh descritos na documentação de migração."
      },
      {
        kind: "roles",
        text: "Tela dedicada em /backup; atalho na aba Backup da Administração."
      }
    ]
  },
  {
    id: "sobre-manual",
    title: "Sobre este manual",
    blocks: [
      {
        kind: "p",
        parts: [
          "O texto desta página pretende descrever as funções do ponto de vista de quem utiliza o sistema no dia a dia. Última atualização do conteúdo: ",
          MANUAL_LAST_UPDATED,
          ". Em caso de diferença entre o manual e a tela, o comportamento do sistema e as mensagens no própria tela prevalecem."
        ]
      }
    ]
  }
];
