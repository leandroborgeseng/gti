/**
 * Manual do utilizador (texto apresentado em `/manual`).
 * Ao alterar menus, fluxos ou permissões da interface, atualize este ficheiro
 * e incremente `MANUAL_LAST_UPDATED` (data ISO YYYY-MM-DD).
 */

export const MANUAL_LAST_UPDATED = "2026-04-19";

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
          "Este sistema reúne a gestão contratual, medições financeiras, glosas, ligação a chamados GLPI, governança de SLA, metas, projetos e relatórios. O objetivo é dar visibilidade à operação e ao cumprimento contratual num único painel."
        ]
      },
      {
        kind: "p",
        parts: [
          "Utilize o menu lateral (ou o menu móvel) para mudar de área. Em várias listagens existe pesquisa e filtros; nas páginas de detalhe, ligações de regresso à lista aparecem no topo."
        ]
      },
      {
        kind: "tip",
        text: "Se algo não carregar, verifique a sessão (voltar a iniciar sessão) e, em caso de erro persistente, contacte a equipa de suporte com o texto do erro apresentado no ecrã."
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
          "Existem três papéis: administrador, editor e leitor. O administrador gere utilizadores (ver ",
          { href: "/users", label: "Utilizadores" },
          " abaixo) e tem acesso total. O editor regista e altera dados operacionais (contratos, medições, etc.). O leitor consulta informação sem alterar registros sensíveis."
        ]
      },
      {
        kind: "roles",
        text: "A página de exportações CSV e algumas acções de escrita podem estar restritas a administrador e editor; o leitor não vê a opção de exportações no menu."
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
          " — Indicadores resumidos (financeiros, chamados, alertas) para acompanhamento rápido da situação global. Os mesmos dados aparecem também na área de ",
          { href: "/reports", label: "Relatórios" },
          ", com contexto de exportações."
        ]
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
          " — Quadro tipo Kanban com chamados sincronizados a partir do GLPI. Pode filtrar por texto, estado, grupo e outras opções. Serve à operação diária (quem trata o quê) e complementa a visão por contrato nas ligações GLPI do detalhe do contrato."
        ]
      },
      {
        kind: "tip",
        text: "A sincronização com o GLPI depende da configuração do servidor e da base de dados; se o quadro estiver vazio ou com erro, o problema é técnico de ligação, não da sua conta."
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
          " — Lista dos contratos. Abra um contrato para ver dados cadastrais (vigência, valores, fornecedor, fiscal, gestor, legislação, tipo), alterar estado quando permitido, e gerir blocos específicos."
        ]
      },
      {
        kind: "ul",
        items: [
          "Valores e vigência: mensalidade, implantação, valor total e período de implantação quando configurados.",
          "Snapshots financeiros: histórico de valores acordados ao longo do tempo, para leitura e conferência.",
          "Proporção de implantação por funcionalidade: repartição do valor de implantação alinhada às funcionalidades do contrato.",
          "Grupos GLPI: associação de grupos do GLPI ao contrato, para contagem de chamados nos relatórios.",
          "Aditivos: registo de alterações contratuais.",
          "Estrutura do contrato (funcionalidades / entregáveis): edição da composição do contrato quando a sua função o permitir."
        ]
      },
      {
        kind: "p",
        parts: [
          "A partir do detalhe, pode saltar para ",
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
          " — Visão das funcionalidades contratuais e respectivos estados de entrega / acompanhamento, alinhadas à estrutura definida nos contratos. Cada contrato e cada módulo têm sanfona (fechados por defeito); no cabeçalho do módulo vê contagens de entregues / parciais / não entregues. Dentro do módulo, use o estado de entrega, o botão de editar (lápis) ou eliminar (caixote), com confirmação e validação da soma dos pesos ao eliminar ou ao gravar edição."
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
          " — Uma medição por contrato e por competência (mês/ano). Cada registo percorre estados: Aberta → Em revisão ou Glosada → Aprovada. O valor aprovado consolida o que conta como medição aprovada para relatórios."
        ]
      },
      {
        kind: "ul",
        items: [
          "Utilize «Nova medição» para abrir o mês seguinte ou a competência em falta.",
          "Na página da medição, calcule e finalize o fluxo conforme o processo interno (revisão, glosa, aprovação)."
        ]
      },
      {
        kind: "p",
        parts: [
          "O ",
          { href: "/reports/fechamento-mensal", label: "relatório de fechamento mensal" },
          " cruza contratos vigentes com a medição do mês, referência do mês anterior (quando há medição aprovada), e estatísticas de ordens de serviço GLPI (abertas, fechadas e represadas) por contrato."
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
          " — Gestão de glosas associadas ao acompanhamento financeiro e contratual. Consulte a lista e abra cada registo para ver detalhe, histórico e acções disponíveis para o seu papel."
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
          " — Chamados com foco em cumprimento de SLA e papéis de governança (gestor, controladoria, observador). Utilize filtros e o detalhe de cada chamado para acompanhar prazos e responsabilidades."
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
          " — Definição e acompanhamento de metas. Na lista vê o estado global; em cada meta, o detalhe e a evolução."
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
          " — Projetos e iniciativas. Pode existir uma vista de ",
          { href: "/projetos/tarefas", label: "tarefas" },
          " para trabalho transversal. Abra um projeto para ver fases, tarefas e informação associada."
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
          " — Cadastro de empresas fornecedoras utilizadas nos contratos.",
          " ",
          { href: "/fiscais", label: "Fiscais" },
          " — Cadastro de fiscais do contrato. Ambos alimentam campos de selecção no detalhe do contrato."
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
          " — Descarregamento de ficheiros CSV (contratos, medições, glosas, aditivos) em UTF-8, para arquivo ou análise externa."
        ]
      },
      {
        kind: "roles",
        text: "Reservado a utilizadores com perfil de edição ou administração (não aparece no menu para leitores)."
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
          " — Hub com o painel resumido e ligação ao fechamento mensal. O fechamento mensal mostra, por contrato e mês selecionado, referência da medição anterior, estado da medição da competência, valores aprovados quando aplicável, e contagens GLPI incluindo ordens represadas de meses anteriores."
        ]
      }
    ]
  },
  {
    id: "utilizadores",
    title: "Utilizadores",
    blocks: [
      {
        kind: "p",
        parts: [
          { href: "/users", label: "Utilizadores" },
          " — Gestão de contas (convites, papéis, estado). Visível apenas para administradores."
        ]
      },
      {
        kind: "roles",
        text: "Menu «Utilizadores» só é mostrado a administradores."
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
          ". Em caso de diferença entre o manual e o ecrã, o comportamento do sistema e as mensagens no próprio ecrã prevalecem."
        ]
      }
    ]
  }
];
