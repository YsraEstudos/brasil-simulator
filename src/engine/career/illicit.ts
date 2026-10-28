import { keyedRng } from './draw';
import type { CareerStage } from '../types';
import type { ParamSpec } from '../economy/calibration';

/** Valores fictícios para diagnóstico; sujeitos a calibração por simulação e revisão de conteúdo. */
export const ILLICIT_PARAMS = {
  decay: {
    value: 0.5,
    min: 0,
    max: 0.95,
    note: 'retenção da exposição por turno',
    basis: 'FICTICIO: critério de jogo',
  },
  sensitivity: {
    value: 0.0002,
    min: 0,
    max: 0.01,
    note: 'sensibilidade do risco à exposição em R$ mil',
    basis: 'FICTICIO: critério de jogo',
  },
  maxHazard: {
    value: 0.35,
    min: 0,
    max: 1,
    note: 'limite superior de risco por turno',
    basis: 'FICTICIO: critério de jogo',
  },
  monthlyLimit: {
    value: 1000,
    min: 0,
    max: 10000,
    note: 'entrada máxima por mês em R$ mil',
    basis: 'FICTICIO: critério de jogo',
  },
} as const satisfies Record<string, ParamSpec>;

/** Estado sucinto; investigações já iniciadas continuam depois de cessar a exposição. */
export interface IllicitState {
  exposure: number;
  investigations: number;
}
export interface IllicitCalibration {
  decay: number;
  sensitivity: number;
  maxHazard: number;
  monthlyLimit: number;
}
export interface IllicitInspection {
  state: IllicitState;
  exposureBeforeInspection: number;
  hazard: number;
  discovered: boolean;
}

/** Sobrescritas do cenário permitem testes e calibração sem mudar o motor. */
export function resolveIllicitCalibration(overrides: Partial<IllicitCalibration>): IllicitCalibration {
  return {
    decay: overrides.decay ?? ILLICIT_PARAMS.decay.value,
    sensitivity: overrides.sensitivity ?? ILLICIT_PARAMS.sensitivity.value,
    maxHazard: overrides.maxHazard ?? ILLICIT_PARAMS.maxHazard.value,
    monthlyLimit: overrides.monthlyLimit ?? ILLICIT_PARAMS.monthlyLimit.value,
  };
}

/** Um único sorteio por turno; exposição descoberta é zerada, sem apagar investigações anteriores. */
export function inspectIllicitTurn(
  state: IllicitState,
  volume: number,
  calibration: IllicitCalibration,
  seed: number,
  stage: CareerStage,
  turnIndex: number,
): IllicitInspection {
  const { decay, sensitivity, maxHazard, monthlyLimit } = calibration;
  if (
    !Number.isFinite(state.exposure) ||
    state.exposure < 0 ||
    !Number.isSafeInteger(state.investigations) ||
    state.investigations < 0 ||
    !Number.isSafeInteger(volume) ||
    volume < 0 ||
    !Number.isSafeInteger(monthlyLimit) ||
    monthlyLimit < 0 ||
    volume > monthlyLimit ||
    !Number.isFinite(decay) ||
    decay < 0 ||
    decay >= 1 ||
    !Number.isFinite(sensitivity) ||
    sensitivity < 0 ||
    !Number.isFinite(maxHazard) ||
    maxHazard < 0 ||
    maxHazard > 1 ||
    !Number.isSafeInteger(turnIndex) ||
    turnIndex < 0 ||
    !Number.isSafeInteger(seed)
  )
    throw new RangeError('fiscalização de campanha inválida');
  const exposureBeforeInspection = decay * state.exposure + volume;
  if (!Number.isFinite(exposureBeforeInspection)) throw new RangeError('exposição inválida');
  const hazard = Math.min(maxHazard, -Math.expm1(-sensitivity * exposureBeforeInspection));
  const discovered = hazard > 0 && keyedRng(seed, ['career', 'illicit', stage, turnIndex]).chance(hazard);
  return {
    state: {
      exposure: discovered ? 0 : exposureBeforeInspection,
      investigations: state.investigations + (discovered ? 1 : 0),
    },
    exposureBeforeInspection,
    hazard,
    discovered,
  };
}
