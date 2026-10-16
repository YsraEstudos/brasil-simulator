import { type GameEvent, parseGameEvent } from '@/types/event';

import altaPetroleo from '@/data/events/alta_petroleo.json';
import calibragemCbs from '@/data/events/calibragem_cbs.json';
import camaraTravaPauta from '@/data/events/camara_trava_pauta.json';
import dadosEmpregoSurpreendem from '@/data/events/dados_emprego_surpreendem.json';
import dividasEstaduais from '@/data/events/dividas_estaduais.json';
import enchentesMetropole from '@/data/events/enchentes_metropole.json';
import escandaloMinisterio from '@/data/events/escandalo_ministerio.json';
import fndrGovernadores from '@/data/events/fndr_governadores.json';
import grevesServidores from '@/data/events/greve_servidores.json';
import orcamentoTransicao from '@/data/events/orcamento_transicao.json';
import paralisacaoMaquina from '@/data/events/paralisacao_maquina.json';
import pressaoGovernadores from '@/data/events/pressao_governadores.json';
import regimesDiferenciados from '@/data/events/regimes_diferenciados.json';
import revisaoRating from '@/data/events/revisao_rating.json';
import saidaCapitais from '@/data/events/saida_capitais.json';
import secaSafraEnergia from '@/data/events/seca_safra_energia.json';
import fase07EcoBancosPreveemRecessao from '@/data/events/fase07_eco_bancos_preveem_recessao.json';
import fase07EcoBoomCommodities from '@/data/events/fase07_eco_boom_commodities.json';
import fase07EcoCriseHidricaContaLuz from '@/data/events/fase07_eco_crise_hidrica_conta_luz.json';
import fase07EcoFugaCapitaisRuidoFiscal from '@/data/events/fase07_eco_fuga_capitais_ruido_fiscal.json';
import fase07EcoGreveCaminhoneiros from '@/data/events/fase07_eco_greve_caminhoneiros.json';
import fase07EcoGreveEntregadores from '@/data/events/fase07_eco_greve_entregadores.json';
import fase07EcoGuerraFiscalEstados from '@/data/events/fase07_eco_guerra_fiscal_estados.json';
import fase07EcoOndaCalorDemandaEnergia from '@/data/events/fase07_eco_onda_calor_demanda_energia.json';
import fase07EcoPacoteInfraestruturaPrivada from '@/data/events/fase07_eco_pacote_infraestrutura_privada.json';
import fase07EcoPressaoMetaFiscal from '@/data/events/fase07_eco_pressao_meta_fiscal.json';
import fase07EcoQuebraSafraTermosTroca from '@/data/events/fase07_eco_quebra_safra_termos_troca.json';
import fase07EcoQuedaAbruptaCambio from '@/data/events/fase07_eco_queda_abrupta_cambio.json';
import fase07EcoRecuperacaoEmpregoIndustrial from '@/data/events/fase07_eco_recuperacao_emprego_industrial.json';
import fase07EcoSurtoInflacaoAlimentos from '@/data/events/fase07_eco_surto_inflacao_alimentos.json';
import fase07InstCpiInstalada from '@/data/events/fase07_inst_cpi_instalada.json';
import fase07InstCpiRelatorio from '@/data/events/fase07_inst_cpi_relatorio.json';
import fase07InstDenunciaImprensa from '@/data/events/fase07_inst_denuncia_imprensa.json';
import fase07InstImpeachmentCamara from '@/data/events/fase07_inst_impeachment_camara.json';
import fase07InstImpeachmentSenado from '@/data/events/fase07_inst_impeachment_senado.json';
import fase07InstPactoInstitucional from '@/data/events/fase07_inst_pacto_institucional.json';
import fase07InstPedidoImpeachment from '@/data/events/fase07_inst_pedido_impeachment.json';
import fase07InstTcuAlerta from '@/data/events/fase07_inst_tcu_alerta.json';
import fase07InstTcuParecer from '@/data/events/fase07_inst_tcu_parecer.json';
import fase07PolAgroBoicote from '@/data/events/fase07_pol_agro_boicote.json';
import fase07PolBalancoMandato from '@/data/events/fase07_pol_balanco_mandato.json';
import fase07PolCamaraCargos from '@/data/events/fase07_pol_camara_cargos.json';
import fase07PolColunaDisputa from '@/data/events/fase07_pol_coluna_disputa.json';
import fase07PolGreveProfessores from '@/data/events/fase07_pol_greve_professores.json';
import fase07PolNordesteObras from '@/data/events/fase07_pol_nordeste_obras.json';
import fase07PolOposicaoObstrui from '@/data/events/fase07_pol_oposicao_obstrui.json';
import fase07PolPesquisaPobres from '@/data/events/fase07_pol_pesquisa_pobres.json';
import fase07PolSegurancaRegiao from '@/data/events/fase07_pol_seguranca_regiao.json';
import fase07PolSenadoPacto from '@/data/events/fase07_pol_senado_pacto.json';
import fase07PolSindicalConvoca from '@/data/events/fase07_pol_sindical_convoca.json';
import fase07PolStfSuspende from '@/data/events/fase07_pol_stf_suspende.json';
import fase07PolSudesteFrente from '@/data/events/fase07_pol_sudeste_frente.json';
import fase07PolViceConspira from '@/data/events/fase07_pol_vice_conspira.json';

/**
 * Eventos (src/data/events/*.json), validados ao carregar (GAME_DESIGN.md §11.3): os 10 do protótipo, os 5 de
 * 2027 da Fase 03 o das dívidas estaduais da Fase 05 e os 37 da Fase 07 (`fase07_*`, só no cenário v0.6.0). A ordem importa: o sorteio segue esta lista até `max_eventos_mes` (o orçamento de transição
 * vem primeiro para sempre chegar em fevereiro de 2027).
 */
const RAW_EVENTS: readonly unknown[] = [
  orcamentoTransicao,
  altaPetroleo,
  secaSafraEnergia,
  grevesServidores,
  escandaloMinisterio,
  revisaoRating,
  camaraTravaPauta,
  enchentesMetropole,
  saidaCapitais,
  pressaoGovernadores,
  dadosEmpregoSurpreendem,
  calibragemCbs,
  regimesDiferenciados,
  fndrGovernadores,
  paralisacaoMaquina,
  dividasEstaduais,
  fase07EcoBancosPreveemRecessao,
  fase07EcoBoomCommodities,
  fase07EcoCriseHidricaContaLuz,
  fase07EcoFugaCapitaisRuidoFiscal,
  fase07EcoGreveCaminhoneiros,
  fase07EcoGreveEntregadores,
  fase07EcoGuerraFiscalEstados,
  fase07EcoOndaCalorDemandaEnergia,
  fase07EcoPacoteInfraestruturaPrivada,
  fase07EcoPressaoMetaFiscal,
  fase07EcoQuebraSafraTermosTroca,
  fase07EcoQuedaAbruptaCambio,
  fase07EcoRecuperacaoEmpregoIndustrial,
  fase07EcoSurtoInflacaoAlimentos,
  fase07InstCpiInstalada,
  fase07InstCpiRelatorio,
  fase07InstDenunciaImprensa,
  fase07InstImpeachmentCamara,
  fase07InstImpeachmentSenado,
  fase07InstPactoInstitucional,
  fase07InstPedidoImpeachment,
  fase07InstTcuAlerta,
  fase07InstTcuParecer,
  fase07PolAgroBoicote,
  fase07PolBalancoMandato,
  fase07PolCamaraCargos,
  fase07PolColunaDisputa,
  fase07PolGreveProfessores,
  fase07PolNordesteObras,
  fase07PolOposicaoObstrui,
  fase07PolPesquisaPobres,
  fase07PolSegurancaRegiao,
  fase07PolSenadoPacto,
  fase07PolSindicalConvoca,
  fase07PolStfSuspende,
  fase07PolSudesteFrente,
  fase07PolViceConspira,
];

function load(raw: unknown, index: number): GameEvent {
  const r = parseGameEvent(raw);
  if (!r.ok) throw new Error(`evento inválido (posição ${index}):\n${r.errors.join('\n')}`);
  return r.event;
}

export const EVENTS: readonly GameEvent[] = RAW_EVENTS.map(load);
