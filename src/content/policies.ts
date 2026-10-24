import { parsePolicy, type Policy } from '@/types/policy';

import contingenciamento from '@/data/policies/contingenciamento.json';
import gastosTributariosRevisao from '@/data/policies/gastos_tributarios_revisao.json';
import infraestruturaCreditoAdicional from '@/data/policies/infraestrutura_credito_adicional.json';
import iofCreditoReducao from '@/data/policies/iof_credito_reducao.json';
import irpfTabela from '@/data/policies/irpf_tabela.json';
import reformaAdministrativa from '@/data/policies/reforma_administrativa.json';
import reformaPrevidencia from '@/data/policies/reforma_previdencia.json';
import salarioMinimoValorizacao from '@/data/policies/salario_minimo_valorizacao.json';
import segurancaCooperacao from '@/data/policies/seguranca_cooperacao.json';
import transferenciaRendaAmpliacao from '@/data/policies/transferencia_renda_ampliacao.json';
import projetoArmazenagemAgropecuaria from '@/data/policies/projeto_armazenagem_agropecuaria.json';
import projetoConectividadePublica from '@/data/policies/projeto_conectividade_publica.json';
import projetoCorredoresLogisticos from '@/data/policies/projeto_corredores_logisticos.json';
import projetoEscolasTempoIntegral from '@/data/policies/projeto_escolas_tempo_integral.json';
import projetoHabitacaoInteresseSocial from '@/data/policies/projeto_habitacao_interesse_social.json';
import projetoHospitaisRegionais from '@/data/policies/projeto_hospitais_regionais.json';
import projetoMobilidadeUrbana from '@/data/policies/projeto_mobilidade_urbana.json';
import projetoRequalificacaoPortuaria from '@/data/policies/projeto_requalificacao_portuaria.json';
import projetoSaneamentoResiliente from '@/data/policies/projeto_saneamento_resiliente.json';
import projetoTransmissaoEnergia from '@/data/policies/projeto_transmissao_energia.json';
import projetoSegurancaHidrica from '@/data/policies/projeto_seguranca_hidrica.json';
import projetoDrenagemContencao from '@/data/policies/projeto_drenagem_contencao.json';
import rotinaDefesaCivil from '@/data/policies/rotina_defesa_civil.json';
import rotinaAlfabetizacao from '@/data/policies/rotina_alfabetizacao.json';
import rotinaAssistenciaTecnicaRural from '@/data/policies/rotina_assistencia_tecnica_rural.json';
import rotinaAtencaoBasica from '@/data/policies/rotina_atencao_basica.json';
import rotinaAtendimentoPrevidenciario from '@/data/policies/rotina_atendimento_previdenciario.json';
import rotinaAvaliacaoContratos from '@/data/policies/rotina_avaliacao_contratos.json';
import rotinaBuscaAtivaSocial from '@/data/policies/rotina_busca_ativa_social.json';
import rotinaComprasPublicas from '@/data/policies/rotina_compras_publicas.json';
import rotinaDefesaAgropecuaria from '@/data/policies/rotina_defesa_agropecuaria.json';
import rotinaEficienciaEnergetica from '@/data/policies/rotina_eficiencia_energetica.json';
import rotinaEficienciaSaneamento from '@/data/policies/rotina_eficiencia_saneamento.json';
import rotinaExecucaoOrcamentaria from '@/data/policies/rotina_execucao_orcamentaria.json';
import rotinaFormacaoDocente from '@/data/policies/rotina_formacao_docente.json';
import rotinaIntegracaoCriminal from '@/data/policies/rotina_integracao_criminal.json';
import rotinaManutencaoRodovias from '@/data/policies/rotina_manutencao_rodovias.json';
import rotinaMonitoramentoMineral from '@/data/policies/rotina_monitoramento_mineral.json';
import rotinaPericiaPrevidenciaria from '@/data/policies/rotina_pericia_previdenciaria.json';
import rotinaPrevencaoViolencia from '@/data/policies/rotina_prevencao_violencia.json';
import rotinaQualificacaoCadastros from '@/data/policies/rotina_qualificacao_cadastros.json';
import rotinaRegularizacaoUrbanistica from '@/data/policies/rotina_regularizacao_urbanistica.json';
import rotinaSegurancaViaria from '@/data/policies/rotina_seguranca_viaria.json';
import rotinaServicosDigitais from '@/data/policies/rotina_servicos_digitais.json';
import rotinaVigilanciaEpidemiologica from '@/data/policies/rotina_vigilancia_epidemiologica.json';

/** Catálogo de políticas (src/data/policies/*.json), validado ao carregar: um JSON inválido é erro de desenvolvimento. */
const RAW: readonly unknown[] = [
  infraestruturaCreditoAdicional,
  iofCreditoReducao,
  irpfTabela,
  contingenciamento,
  transferenciaRendaAmpliacao,
  segurancaCooperacao,
  gastosTributariosRevisao,
  reformaAdministrativa,
  salarioMinimoValorizacao,
  reformaPrevidencia,
  rotinaExecucaoOrcamentaria,
  rotinaComprasPublicas,
  rotinaServicosDigitais,
  rotinaAvaliacaoContratos,
  rotinaAtendimentoPrevidenciario,
  rotinaPericiaPrevidenciaria,
  rotinaBuscaAtivaSocial,
  rotinaQualificacaoCadastros,
  rotinaManutencaoRodovias,
  rotinaSegurancaViaria,
  rotinaAtencaoBasica,
  rotinaVigilanciaEpidemiologica,
  rotinaAlfabetizacao,
  rotinaFormacaoDocente,
  rotinaIntegracaoCriminal,
  rotinaPrevencaoViolencia,
  rotinaRegularizacaoUrbanistica,
  rotinaEficienciaSaneamento,
  rotinaAssistenciaTecnicaRural,
  rotinaDefesaAgropecuaria,
  rotinaEficienciaEnergetica,
  rotinaMonitoramentoMineral,
  projetoHospitaisRegionais,
  projetoEscolasTempoIntegral,
  projetoSaneamentoResiliente,
  projetoCorredoresLogisticos,
  projetoTransmissaoEnergia,
  projetoHabitacaoInteresseSocial,
  projetoConectividadePublica,
  projetoArmazenagemAgropecuaria,
  projetoMobilidadeUrbana,
  projetoRequalificacaoPortuaria,
  // PR 13 do PLANO_GLOBO (prevenção hídrica e Defesa Civil): só o cenário v0.8.0 as oferece (`PREVENTION_POLICY_IDS`).
  projetoSegurancaHidrica,
  projetoDrenagemContencao,
  rotinaDefesaCivil,
];

/** Políticas de prevenção climática do PR 13: citadas apenas pelo cenário v0.8.0 (os publicados não mudam). */
export const PREVENTION_POLICY_IDS: readonly string[] = [
  'projeto_seguranca_hidrica',
  'projeto_drenagem_contencao',
  'rotina_defesa_civil',
];

function loadPolicies(raw: readonly unknown[]): Record<string, Policy> {
  const result: Record<string, Policy> = {};
  const errors: string[] = [];
  for (const item of raw) {
    const r = parsePolicy(item);
    if (!r.ok) {
      const id = typeof item === 'object' && item !== null && 'id' in item ? String(item.id) : '(sem id)';
      errors.push(...r.errors.map((e) => `${id} -> ${e}`));
      continue;
    }
    if (result[r.policy.id]) {
      errors.push(`${r.policy.id} -> id duplicado`);
      continue;
    }
    result[r.policy.id] = r.policy;
  }
  if (errors.length > 0) throw new Error(`política inválida:\n${errors.join('\n')}`);
  return result;
}

export const POLICIES: Readonly<Record<string, Policy>> = loadPolicies(RAW);
