/** Hipóteses de jogo PROVISORIAS, não projeções oficiais. Taxas anuais e frações iniciais. */
export const DEMOGRAPHY_CALIBRATION = {
  initialYoung: 0.27,
  initialOlder: 0.11,
  annualBirthsPerPerson: 0.012,
  annualDeathYoung: 0.0005,
  annualDeathWorking: 0.003,
  annualDeathOlder: 0.035,
  annualInternalMigration: 0.006,
  annualExternalMigration: 0.0002,
  youngYears: 20,
  workingYears: 45,
  pensionGrowthSensitivity: 0.4,
  pensionMonthlyAdjustmentLimit: 0.01,
} as const;
