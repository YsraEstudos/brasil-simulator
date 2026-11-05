import { StyleSheet, View } from 'react-native';

import { keepAwakeNote } from '@/components/painel/hudClockModel';
import { Button, Card, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useKeepAwakeAvailable } from '@/hooks/use-keep-screen-awake';
import {
  FISCAL_UNITS,
  gameStore,
  GLOBE_FPS_CHOICES,
  GLOBE_SPEED_STEPS,
  THEME_CHOICES,
  useGame,
  type FiscalUnit,
  type PreferenceKey,
  type Preferences,
  type ThemeChoice,
} from '@/store';

const THEME_LABEL: Record<ThemeChoice, string> = { sistema: 'Do sistema', claro: 'Claro', escuro: 'Escuro' };
const FISCAL_LABEL: Record<FiscalUnit, string> = { reais: 'R$ bilhões', pib: '% do PIB' };

const speedLabel = (v: number) => `${v.toLocaleString('pt-BR')}×`;

function setPref<K extends PreferenceKey>(key: K, value: Preferences[K]) {
  void gameStore.getState().setPreference(key, value);
}

/** Linha de escolha única: um botão por opção, o escolhido em destaque. */
function Choices<T extends string | number>({
  options,
  value,
  label,
  onChange,
}: {
  options: readonly T[];
  value: T;
  label: (option: T) => string;
  onChange: (option: T) => void;
}) {
  return (
    <View style={styles.row}>
      {options.map((option) => (
        <Button
          key={String(option)}
          label={label(option)}
          variant={option === value ? 'primary' : 'secondary'}
          onPress={() => onChange(option)}
          accessibilityHint={option === value ? 'Escolha atual' : 'Usar esta opção'}
        />
      ))}
    </View>
  );
}

/** Interruptor simples (Sim/Não) com a legenda abaixo. */
function Toggle({
  value,
  onChange,
  description,
}: {
  value: boolean;
  onChange: (on: boolean) => void;
  description: string;
}) {
  return (
    <View style={styles.option}>
      <Choices
        options={[true, false].map(String)}
        value={String(value)}
        label={(o) => (o === 'true' ? 'Sim' : 'Não')}
        onChange={(o) => onChange(o === 'true')}
      />
      <Text variant="caption" color="textSecondary">
        {description}
      </Text>
    </View>
  );
}

/**
 * Cartões das preferências do registro (PLANO_MENU_SAVES_CONFIG.md, Fases M6 e M7): aparência, acessibilidade, valores
 * fiscais, globo, tela durante a partida (H1), animações e abertura do app. Tudo vale na hora e fica gravado no aparelho (fora do save).
 */
export function PreferenceCards() {
  const prefs = useGame((s) => s.prefs);
  const keepAwakeAvailable = useKeepAwakeAvailable();

  return (
    <>
      <Card title="Aparência" subtitle="Tema das telas fora do Painel">
        <Choices
          options={THEME_CHOICES}
          value={prefs.theme}
          label={(t) => THEME_LABEL[t]}
          onChange={(t) => setPref('theme', t)}
        />
        <Text variant="caption" color="textSecondary">
          O Painel (globo e mesa) é sempre escuro, para o mapa ficar legível.
        </Text>
      </Card>

      <Card title="Acessibilidade" subtitle="Cores e posição dos controles">
        <Text variant="label">Modo para daltônicos</Text>
        <Toggle
          value={prefs.colorBlind}
          onChange={(on) => setPref('colorBlind', on)}
          description="Troca verde e vermelho por azul e laranja e mostra sempre os sinais + e − nas variações."
        />
        <Text variant="label">Modo canhoto</Text>
        <Toggle
          value={prefs.leftHanded}
          onChange={(on) => setPref('leftHanded', on)}
          description="Inverte os trilhos laterais do Painel e leva o botão de encerrar o mês para a esquerda."
        />
      </Card>

      <Card title="Valores fiscais" subtitle="Como mostrar receitas, despesas, resultado e dívida">
        <Choices
          options={FISCAL_UNITS}
          value={prefs.fiscalUnit}
          label={(u) => FISCAL_LABEL[u]}
          onChange={(u) => setPref('fiscalUnit', u)}
        />
        <Text variant="caption" color="textSecondary">
          Só muda a exibição. A conversão usa o PIB anual do mês corrente.
        </Text>
      </Card>

      <Card title="Globo" subtitle="Desempenho e controle do globo 3D">
        <Text variant="label">Limite de quadros</Text>
        <Choices
          options={GLOBE_FPS_CHOICES}
          value={prefs.globeFps}
          label={(f) => `${f} FPS`}
          onChange={(f) => setPref('globeFps', f)}
        />
        <Text variant="caption" color="textSecondary">
          30 FPS economiza bateria na inércia e na transição do Sol. Arrastar o globo continua fluido. Com 30 FPS, a
          qualidade automática fica parada no perfil atual.
        </Text>
        <Text variant="label">Velocidade de rotação</Text>
        <Choices
          options={GLOBE_SPEED_STEPS}
          value={prefs.globeRotationSpeed}
          label={speedLabel}
          onChange={(v) => setPref('globeRotationSpeed', v)}
        />
        <Text variant="label">Velocidade do zoom</Text>
        <Choices
          options={GLOBE_SPEED_STEPS}
          value={prefs.globeZoomSpeed}
          label={speedLabel}
          onChange={(v) => setPref('globeZoomSpeed', v)}
        />
      </Card>

      <Card title="Durante a partida" subtitle="Tela e relógio no Painel">
        <Text variant="label">Manter a tela acesa</Text>
        <Toggle
          value={prefs.keepScreenAwake}
          onChange={(on) => setPref('keepScreenAwake', on)}
          description={keepAwakeNote(keepAwakeAvailable)}
        />
        <Text variant="label">Relógio e bateria no Painel</Text>
        <Toggle
          value={prefs.hudClock}
          onChange={(on) => setPref('hudClock', on)}
          description="Mostra a hora do aparelho e a bateria num canto do Painel. Sem bateria (computador), só a hora."
        />
      </Card>

      <Card title="Animações" subtitle="Pular a cena de abertura das Notícias">
        <Text variant="label">Pular a abertura do jornal</Text>
        <Toggle
          value={prefs.skipNewspaperIntro}
          onChange={(on) => setPref('skipNewspaperIntro', on)}
          description="O jornal das Notícias já aparece aberto."
        />
        <Text variant="caption" color="textSecondary">
          Com &quot;Reduzir movimento&quot; ligado, a abertura do jornal já é pulada.
        </Text>
      </Card>

      <Card title="Ao abrir o app" subtitle="Onde o jogo começa">
        <Text variant="label">Abrir direto na última campanha ativa</Text>
        <Toggle
          value={prefs.openLastCampaign}
          onChange={(on) => setPref('openLastCampaign', on)}
          description="Pula o menu principal e entra no Painel da partida em andamento. O menu continua no ☰ do Painel."
        />
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  option: { gap: Spacing.one },
});
