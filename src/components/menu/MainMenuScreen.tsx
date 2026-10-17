import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { gameStore, useGame } from '@/store';

import { Menu } from './menuTheme';

const logo = require('../../../assets/images/logo-brasil-metal.png');

interface MenuItem {
  id: 'novo' | 'continuar' | 'carregar' | 'multi' | 'config' | 'conquistas' | 'sair';
  label: string;
  icon: SymbolViewProps['name'];
}

/** Botões do mockup, na ordem: os três primeiros entram no jogo; o resto ainda avisa "em breve". */
const ITEMS: readonly MenuItem[] = [
  { id: 'novo', label: 'NOVO JOGO', icon: { ios: 'play.fill', android: 'play_arrow', web: 'play_arrow' } },
  { id: 'continuar', label: 'CONTINUAR', icon: { ios: 'play.fill', android: 'play_arrow', web: 'play_arrow' } },
  { id: 'carregar', label: 'CARREGAR JOGO', icon: { ios: 'square.and.arrow.down', android: 'save', web: 'save' } },
  { id: 'multi', label: 'MULTIJOGADOR', icon: { ios: 'person.3.fill', android: 'groups', web: 'groups' } },
  { id: 'config', label: 'CONFIGURAÇÕES', icon: { ios: 'gearshape.fill', android: 'settings', web: 'settings' } },
  { id: 'conquistas', label: 'CONQUISTAS', icon: { ios: 'trophy.fill', android: 'emoji_events', web: 'emoji_events' } },
  { id: 'sair', label: 'SAIR', icon: { ios: 'rectangle.portrait.and.arrow.right', android: 'logout', web: 'logout' } },
];

/** O que ainda não tem tela: o toque mostra "em breve" em vez de navegar. */
const SOON: Partial<Record<MenuItem['id'], string>> = {
  multi: 'Multijogador',
  config: 'Configurações',
  conquistas: 'Conquistas',
  sair: 'Sair',
};

/** Login social do rodapé (ações ainda não implementadas). */
const SOCIALS = [
  { id: 'twitter', icon: 'twitter', label: 'Login com X (Twitter)' },
  { id: 'instagram', icon: 'instagram', label: 'Login com Instagram' },
  { id: 'profile', icon: 'user', label: 'Perfil' },
] as const;

/** Métricas fixas do HUD; todo o resto é calculado da área útil medida da tela, então nada sai da tela. */
const BUTTONS = ITEMS.length;
const PANEL_GAP = Spacing.two;
const PANEL_PAD = Spacing.two;
/** Moldura do painel: padding dos dois lados + folga entre os 7 botões. */
const PANEL_CHROME = 2 * PANEL_PAD + (BUTTONS - 1) * PANEL_GAP;
/** Espaço reservado ao rodapé (versão + login) e à folga entre a logo e o painel. */
const FOOTER_H = 60;
const STACK_GAP = Spacing.two;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Alturas de botão, da maior para a menor: vale a maior em que o painel cabe sem engolir a logo. */
const BUTTON_HEIGHTS = [48, 44, 40, 36, 32, 28];

/**
 * Menu principal do jogo (mockup do usuário): logo no topo, painel de botões com moldura verde e dourada e,
 * no canto, versão + login. Fundo preto por enquanto — a arte de fundo entra no bloco marcado abaixo.
 *
 * O layout é calculado da área útil medida (onLayout): os botões encolhem até o painel caber e a logo escala
 * para o espaço que sobra. Retrato empilha; paisagem de tablet/desktop fica como no mockup (painel à
 * esquerda); celular deitado põe a logo ao lado do painel, porque a altura não dá para empilhar.
 */
export function MainMenuScreen() {
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const { textScale } = useTheme();
  const status = useGame((s) => s.status);
  const busy = useGame((s) => s.busy);
  const active = useGame((s) => s.active);
  const campaigns = useGame((s) => s.campaigns);
  const [note, setNote] = useState<string | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Área útil dentro de safe areas e margens: estimada pela janela e corrigida pelo onLayout.
  const padX = 2 * Spacing.three + insets.left + insets.right;
  const padY = Spacing.three + Spacing.two + insets.top + insets.bottom;
  const [frame, setFrame] = useState({ w: winW - padX, h: winH - padY });
  const onFrameLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setFrame((f) => (f.w === width && f.h === height ? f : { w: width, h: height }));
  }, []);

  const landscape = frame.w > frame.h;
  // Celular deitado: não há altura para empilhar logo + painel; a logo vai para o lado do painel.
  const sideBySide = landscape && frame.h < 500;
  const avail = frame.h - FOOTER_H - STACK_GAP;

  // Altura do botão: a maior em que o painel cabe (empilhado, deixando ainda ≥15% da área para a logo).
  const btnH = sideBySide
    ? clamp(Math.floor((frame.h - FOOTER_H - PANEL_CHROME) / BUTTONS), 28, 44)
    : (BUTTON_HEIGHTS.find((bh) => BUTTONS * bh + PANEL_CHROME <= avail * 0.85) ?? 28);
  const panelH = BUTTONS * btnH + PANEL_CHROME;
  const panelW = sideBySide
    ? Math.min(340, frame.w * 0.52)
    : landscape
      ? Math.min(340, frame.w * 0.4)
      : Math.min(frame.w, 440);
  const logoAreaH = sideBySide ? 0 : Math.max(56, avail - panelH);
  const logoW = sideBySide
    ? Math.min((frame.w - panelW - Spacing.four) * 0.92, (frame.h - FOOTER_H) * 2, 340)
    : Math.min(frame.w * 0.8, landscape ? 520 : 380, logoAreaH * 2);
  const rowH = frame.h - FOOTER_H;

  const version = Constants.expoConfig?.version ?? '1.0.0';
  const labelSize = Math.round(btnH * 0.35 * Math.min(textScale, 1.3));
  const iconSize = Math.round(btnH * 0.45);

  /** Aviso rápido no rodapé ("em breve", "nenhuma partida salva"). */
  const showNote = useCallback((text: string) => {
    setNote(text);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), 2000);
  }, []);
  const showSoon = useCallback((label: string) => showNote(`${label} — em breve`), [showNote]);

  useEffect(
    () => () => {
      if (noteTimer.current) clearTimeout(noteTimer.current);
    },
    [],
  );

  /**
   * CONTINUAR: retoma a última partida jogada (a mais recentemente atualizada). Com uma partida já aberta
   * em memória, só entra — recarregar do banco descartaria a agenda do mês em montagem.
   */
  const continueLast = useCallback(async () => {
    if (busy || status === 'iniciando') return;
    if (!active) {
      const last = campaigns.reduce<(typeof campaigns)[number] | null>(
        (best, c) => (!best || c.updatedAt > best.updatedAt ? c : best),
        null,
      );
      if (!last) {
        showNote('Nenhuma partida salva — comece um NOVO JOGO');
        return;
      }
      // Só entra na Presidência se a partida carregou de fato (a falha fica registrada na store).
      if (!(await gameStore.getState().continueCampaign(last.id))) {
        showNote('Não foi possível carregar a última partida');
        return;
      }
    }
    router.push('/presidencia');
  }, [active, busy, campaigns, showNote, status]);

  const onPressItem = useCallback(
    (id: MenuItem['id']) => {
      // NOVO JOGO e CARREGAR JOGO têm telas próprias: abri-las não fecha a partida em andamento nem o rascunho.
      if (id === 'novo') {
        router.push('/novo-jogo');
        return;
      }
      if (id === 'carregar') {
        router.push('/carregar-jogo');
        return;
      }
      if (id === 'continuar') {
        void continueLast();
        return;
      }
      const label = SOON[id];
      if (label) showSoon(label);
    },
    [continueLast, showSoon],
  );

  const panel = (
    <View
      style={[
        styles.panel,
        {
          width: panelW,
          padding: PANEL_PAD,
          gap: PANEL_GAP,
          // Na pilha (coluna), o painel fica à esquerda em paisagem e centrado em retrato; na linha
          // (celular deitado) o alinhamento vertical vem do `alignItems` da linha.
          alignSelf: sideBySide ? undefined : landscape ? 'flex-start' : 'center',
        },
      ]}>
      {ITEMS.map((item) => (
        <Pressable
          key={item.id}
          accessibilityLabel={item.label}
          accessibilityRole="button"
          disabled={busy}
          hitSlop={btnH < 44 ? Spacing.one : undefined}
          onPress={() => onPressItem(item.id)}
          style={({ pressed }) => [
            styles.button,
            { height: btnH, paddingHorizontal: btnH >= 40 ? Spacing.three : Spacing.two + Spacing.half },
            pressed && !busy && styles.buttonPressed,
          ]}>
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            numberOfLines={1}
            style={[styles.buttonLabel, { fontSize: labelSize }]}>
            {item.label}
          </Text>
          <SymbolView name={item.icon} size={iconSize} tintColor={Menu.icon} />
        </Pressable>
      ))}
    </View>
  );

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {/* Fundo preto por enquanto — quando existir, a arte de fundo do jogo entra neste lugar. */}
      <View pointerEvents="none" style={styles.background} />

      <View
        style={[
          styles.safe,
          {
            paddingTop: Spacing.three + insets.top,
            paddingBottom: Spacing.two + insets.bottom,
            paddingLeft: Spacing.three + insets.left,
            paddingRight: Spacing.three + insets.right,
          },
        ]}>
        <View onLayout={onFrameLayout} style={styles.frame}>
          {sideBySide ? (
            <View style={[styles.row, { height: rowH }]}>
              {panel}
              <View style={styles.logoAreaSide}>
                <Image resizeMode="contain" source={logo} style={{ width: logoW, height: logoW / 2 }} />
              </View>
            </View>
          ) : (
            <>
              <View style={[styles.logoArea, { height: logoAreaH }]}>
                <Image resizeMode="contain" source={logo} style={{ width: logoW, height: logoW / 2 }} />
              </View>
              <View style={styles.spacer} />
              {panel}
              <View style={styles.spacer} />
            </>
          )}

          <View style={styles.footer}>
            <Text style={styles.version}>{`v${version} - BETA`}</Text>
            <View style={styles.loginRow}>
              <Text style={styles.loginLabel}>Login:</Text>
              {SOCIALS.map((s) => (
                <Pressable
                  key={s.id}
                  accessibilityLabel={s.label}
                  accessibilityRole="button"
                  hitSlop={Spacing.two}
                  onPress={() => showSoon('Login social')}
                  style={({ pressed }) => [styles.social, pressed && styles.socialPressed]}>
                  <FontAwesome6 color={Menu.social} name={s.icon} size={15} />
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </View>

      {note ? (
        <View pointerEvents="none" style={[styles.toastWrap, { bottom: insets.bottom + 80 }]}>
          <View style={styles.toast}>
            <Text style={styles.toastText}>{note}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Menu.background },
  background: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: Menu.background },
  safe: { flex: 1 },
  frame: { flex: 1, width: '100%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.four },
  logoArea: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  logoAreaSide: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  spacer: { flex: 1 },
  panel: {
    borderWidth: 2,
    borderRadius: Radius.md,
    borderColor: Menu.panelBorder,
    backgroundColor: Menu.panel,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    borderWidth: 1.5,
    borderRadius: Radius.sm,
    borderColor: Menu.buttonBorder,
    backgroundColor: Menu.button,
  },
  buttonPressed: {
    borderColor: Menu.buttonBorderBright,
    backgroundColor: Menu.buttonPressed,
    transform: [{ scale: 0.99 }],
  },
  buttonLabel: { color: Menu.text, fontWeight: '700', letterSpacing: 1 },
  footer: { alignItems: 'flex-end', gap: Spacing.one },
  version: { color: Menu.textDim, fontSize: 12, fontWeight: '600', letterSpacing: 0.4 },
  loginRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  loginLabel: { color: Menu.text, fontSize: 13, fontWeight: '600' },
  social: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Menu.socialButton,
    borderWidth: 1,
    borderColor: Menu.socialBorder,
  },
  socialPressed: { backgroundColor: Menu.socialPressed, borderColor: Menu.buttonBorderBright },
  toastWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  toast: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.pill,
    borderColor: Menu.buttonBorder,
    backgroundColor: Menu.toast,
  },
  toastText: { color: Menu.text, fontSize: 13, fontWeight: '600', letterSpacing: 0.3 },
});
