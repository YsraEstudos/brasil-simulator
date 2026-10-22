import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { shortMonthLabel } from '@/components/campaign/labels';
import {
  NEWS_FILTERS,
  NEWS_FILTER_LABEL,
  NEWS_KIND_LABEL,
  NEWS_TONE_LABEL,
  NEWS_TONE_MARK,
  newsCharacterName,
  type NewsFilter,
} from '@/components/tabs/newsView';
import type { ActiveMark, PressureBand } from '@/components/tabs/institutionsView';
import { formatNumber } from '@/components/ui';
import { Fonts, MIN_TOUCH } from '@/constants/theme';
import { useScaledStyles } from '@/hooks/use-scaled-styles';
import { useTheme } from '@/hooks/use-theme';
import type { NewsItem } from '@/engine';

import {
  editionIndexOf,
  editionPage,
  leadFontSize,
  mastheadFontSize,
  NEWSPAPER_NAME,
  newspaperColumns,
  type Edition,
} from './newspaperView';

/** Tinta e papel do jornal: fixos nos dois temas (é um objeto da mesa, não parte da interface). */
const Paper = {
  paper: '#f2ead8',
  paperEdge: '#e2d7bf',
  ink: '#1c1813',
  inkSoft: '#4a4238',
  inkMuted: '#7a6f60',
  rule: '#2a241c',
  ruleSoft: '#c9bc9f',
  positive: '#1f6b3a',
  negative: '#9b2c1f',
  neutral: '#5a5246',
  accent: '#7a1f12',
} as const;

const TONE_COLOR: Record<NewsItem['tone'], string> = {
  positiva: Paper.positive,
  negativa: Paper.negative,
  neutra: Paper.neutral,
};

export interface NewspaperProps {
  width: number;
  /** Altura disponível baixa (celular deitado): cabeçalho compacto. */
  short: boolean;
  editions: readonly Edition[];
  /** Resumo do mês (manchetes do relatório), só na edição mais recente. */
  summary: readonly string[];
  characters: readonly { id: string; name: string }[];
  pressure: number;
  pressureLabel: PressureBand;
  marks: readonly ActiveMark[];
  pending: readonly { key: string; title: string; monthIndex: number }[];
  /** Notícia aberta pelo marcador do mapa: o jornal abre na edição dela e a traz como manchete. */
  focusNewsId?: string;
}

/**
 * O jornal da mesa: cabeçalho, cadernos (filtro por tipo), manchete principal, colunas e quadros laterais.
 * Trocar de edição vira a página (sai para um lado, entra pelo outro); trocar de caderno esmaece o conteúdo.
 */
export function Newspaper({
  width,
  short,
  editions,
  summary,
  characters,
  pressure,
  pressureLabel,
  marks,
  pending,
  focusNewsId,
}: NewspaperProps) {
  const styles = useScaledStyles(baseStyles);
  const [filter, setFilter] = useState<NewsFilter>('todas');
  const [index, setIndex] = useState(() => editionIndexOf(editions, focusNewsId));
  // Outra notícia pedida pelo mapa com o jornal já aberto: vai para a edição dela, no caderno "Todas".
  const [seenFocus, setSeenFocus] = useState(focusNewsId);
  if (focusNewsId !== seenFocus) {
    setSeenFocus(focusNewsId);
    setIndex(editionIndexOf(editions, focusNewsId));
    setFilter('todas');
  }
  // As telas empilhadas ficam montadas: se um mês foi encerrado em outra tela, a edição nova entra na posição 0 e o jornal
  // volta para ela (senão a posição guardada passaria a mostrar outra edição, ou nenhuma, se a mais antiga saiu).
  const latestMonth = editions[0]?.monthIndex;
  const [seenLatest, setSeenLatest] = useState(latestMonth);
  if (latestMonth !== seenLatest) {
    setSeenLatest(latestMonth);
    setIndex(0);
  }
  const flip = useSharedValue(0);
  const fade = useSharedValue(1);
  // Durante a virada a página vira uma textura de GPU (Android): a animação não redesenha o texto a cada quadro.
  const [turning, setTurning] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      clearTimeout(settle.current);
    },
    [],
  );

  const edition = editions[index];
  const page = editionPage(edition, filter, focusNewsId);
  const columns = newspaperColumns(width);
  const pad = width < 420 ? 14 : 22;
  const inner = width - pad * 2;

  /** Vira a página: −1 = edição mais nova (entra pela direita), +1 = mais antiga. */
  const turn = (dir: -1 | 1) => {
    const next = index + dir;
    if (next < 0 || next >= editions.length) return;
    setTurning(true);
    clearTimeout(settle.current);
    settle.current = setTimeout(() => setTurning(false), 520);
    flip.set(withTiming(dir, { duration: 170, easing: Easing.in(Easing.quad) }));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setIndex(next);
      flip.set(
        withSequence(
          withTiming(-dir, { duration: 0 }),
          withTiming(0, { duration: 260, easing: Easing.out(Easing.cubic) }),
        ),
      );
    }, 175);
  };

  const pickFilter = (f: NewsFilter) => {
    if (f === filter) return;
    fade.set(withSequence(withTiming(0.15, { duration: 0 }), withTiming(1, { duration: 280 })));
    setFilter(f);
  };

  const pageStyle = useAnimatedStyle(() => ({
    opacity: (1 - Math.abs(flip.value) * 0.9) * fade.value,
    transform: [{ perspective: 900 }, { translateX: flip.value * -46 }, { rotateY: `${flip.value * 14}deg` }],
  }));

  return (
    <View style={styles.sheet}>
      <ScrollView contentContainerStyle={{ padding: pad, paddingBottom: pad + 8 }} showsVerticalScrollIndicator={false}>
        <Masthead
          edition={edition}
          titleSize={mastheadFontSize(width - pad * 2, short)}
          short={short}
          canNewer={index > 0}
          canOlder={index < editions.length - 1}
          onTurn={turn}
        />
        <Sections value={filter} onChange={pickFilter} />

        <Animated.View style={pageStyle} renderToHardwareTextureAndroid={turning}>
          {!edition ? (
            <Text style={styles.empty}>
              A redação aguarda o primeiro mês de governo. Encerre um mês para a primeira edição chegar à mesa.
            </Text>
          ) : !page.lead ? (
            <Text style={styles.empty}>Nenhuma notícia deste caderno nesta edição.</Text>
          ) : (
            <>
              <Lead item={page.lead} width={inner} characterName={newsCharacterName(page.lead, characters)} />
              {page.others.length > 0 && (
                <View style={styles.grid}>
                  {page.others.map((item, i) => (
                    <Story
                      key={item.id}
                      item={item}
                      characterName={newsCharacterName(item, characters)}
                      width={`${100 / columns}%`}
                      divider={columns > 1 && i % columns !== columns - 1}
                    />
                  ))}
                </View>
              )}
            </>
          )}

          <View style={[styles.boxes, columns > 1 && styles.boxesRow]}>
            {index === 0 && summary.length > 0 && (
              <Box title="Em resumo">
                {summary.map((line, i) => (
                  <Text key={`${i}_${line}`} style={styles.bullet}>{`■ ${line}`}</Text>
                ))}
              </Box>
            )}
            <Box title="Instituições">
              <Text style={styles.boxStrong}>{`Pressão de impeachment: ${pressureLabel}`}</Text>
              <Text style={styles.boxSmall}>{`Índice ${formatNumber(pressure, 2)} em uma escala de 0 a 1.`}</Text>
              {marks.length === 0 ? (
                <Text style={styles.boxText}>Nenhuma marca institucional ativa.</Text>
              ) : (
                marks.map((m) => (
                  <Text
                    key={m.flag}
                    style={styles.boxText}>{`• ${m.label} (desde ${shortMonthLabel(m.sinceMonth)})`}</Text>
                ))
              )}
            </Box>
            <Box title="Na sua mesa">
              {pending.length === 0 ? (
                <Text style={styles.boxText}>Nenhum evento aguardando resposta.</Text>
              ) : (
                pending.map((p) => (
                  <Text key={p.key} style={styles.boxText}>
                    {`• ${p.title} `}
                    <Text style={styles.boxSmall}>{`(${shortMonthLabel(p.monthIndex)} · responda no Gabinete)`}</Text>
                  </Text>
                ))
              )}
            </Box>
          </View>
        </Animated.View>

        <Text style={styles.footer}>
          Jornal fictício de uma simulação independente, sem afiliação a qualquer órgão do governo brasileiro.
        </Text>
      </ScrollView>
    </View>
  );
}

function Masthead({
  edition,
  titleSize,
  short,
  canNewer,
  canOlder,
  onTurn,
}: {
  edition: Edition | undefined;
  titleSize: number;
  short: boolean;
  canNewer: boolean;
  canOlder: boolean;
  onTurn: (dir: -1 | 1) => void;
}) {
  const styles = useScaledStyles(baseStyles);
  return (
    <View>
      <View style={styles.topLine}>
        <Text style={styles.topText}>{edition ? `Edição nº ${edition.number}` : 'Edição de estreia'}</Text>
        <Text style={styles.topText}>{short && edition ? edition.label : 'Simulação fictícia'}</Text>
      </View>
      <View style={styles.rule} />
      <View style={styles.titleRow}>
        <TurnButton label="‹" hint="Edição mais antiga" enabled={canOlder} onPress={() => onTurn(1)} />
        <Text
          style={[styles.title, { fontSize: titleSize, lineHeight: Math.round(titleSize * 1.2) }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          accessibilityRole="header">
          {NEWSPAPER_NAME}
        </Text>
        <TurnButton label="›" hint="Edição mais recente" enabled={canNewer} onPress={() => onTurn(-1)} />
      </View>
      <View style={styles.ruleDouble} />
      {!short && (
        <>
          <Text style={styles.dateLine}>{edition ? edition.label : 'Aguardando o primeiro mês'}</Text>
          <View style={styles.rule} />
        </>
      )}
    </View>
  );
}

function TurnButton({
  label,
  hint,
  enabled,
  onPress,
}: {
  label: string;
  hint: string;
  enabled: boolean;
  onPress: () => void;
}) {
  const styles = useScaledStyles(baseStyles);
  return (
    <Pressable
      onPress={onPress}
      disabled={!enabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={hint}
      accessibilityState={{ disabled: !enabled }}
      style={({ pressed }) => [styles.turn, !enabled && styles.turnOff, pressed && styles.turnPressed]}>
      <Text style={styles.turnText}>{label}</Text>
    </Pressable>
  );
}

/** Cadernos do jornal: o filtro por tipo de notícia. */
function Sections({ value, onChange }: { value: NewsFilter; onChange: (f: NewsFilter) => void }) {
  const styles = useScaledStyles(baseStyles);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.sections}
      accessibilityRole="radiogroup">
      {NEWS_FILTERS.map((f) => {
        const selected = f === value;
        return (
          <Pressable
            key={f}
            onPress={() => onChange(f)}
            accessibilityRole="radio"
            accessibilityLabel={`Caderno: ${NEWS_FILTER_LABEL[f]}`}
            accessibilityState={{ checked: selected }}
            style={styles.section}>
            <Text style={[styles.sectionText, selected && styles.sectionOn]}>{NEWS_FILTER_LABEL[f].toUpperCase()}</Text>
            <View style={[styles.sectionBar, selected && styles.sectionBarOn]} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function Kicker({ item }: { item: NewsItem }) {
  const styles = useScaledStyles(baseStyles);
  return (
    <Text style={[styles.kicker, { color: TONE_COLOR[item.tone] }]}>
      {`${NEWS_TONE_MARK[item.tone]} ${NEWS_KIND_LABEL[item.kind].toUpperCase()} · ${NEWS_TONE_LABEL[item.tone]}`}
    </Text>
  );
}

function Lead({ item, width, characterName }: { item: NewsItem; width: number; characterName: string | undefined }) {
  const styles = useScaledStyles(baseStyles);
  const { textScale } = useTheme();
  const size = leadFontSize(width) * textScale;
  return (
    <View style={styles.lead}>
      <Kicker item={item} />
      <Text style={[styles.leadTitle, { fontSize: size, lineHeight: Math.round(size * 1.12) }]}>{item.headline}</Text>
      <Text style={styles.leadCause}>{item.cause}</Text>
      {characterName && <Text style={styles.byline}>{`Com declarações de ${characterName}`}</Text>}
      <View style={styles.ruleThick} />
    </View>
  );
}

function Story({
  item,
  characterName,
  width,
  divider,
}: {
  item: NewsItem;
  characterName: string | undefined;
  width: `${number}%`;
  divider: boolean;
}) {
  const styles = useScaledStyles(baseStyles);
  return (
    <View style={[styles.story, { width }, divider && styles.storyDivider]}>
      <Kicker item={item} />
      <Text style={styles.storyTitle}>{item.headline}</Text>
      <Text style={styles.storyCause}>{item.cause}</Text>
      {characterName && <Text style={styles.byline}>{`Personagem: ${characterName}`}</Text>}
    </View>
  );
}

function Box({ title, children }: { title: string; children: ReactNode }) {
  const styles = useScaledStyles(baseStyles);
  return (
    <View style={styles.box}>
      <Text style={styles.boxTitle}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

const serif = Fonts?.serif;

const baseStyles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: Paper.paper,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: Paper.paperEdge,
    overflow: 'hidden',
  },
  topLine: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  topText: { fontFamily: serif, fontSize: 11, color: Paper.inkMuted, letterSpacing: 0.6 },
  rule: { height: 1, backgroundColor: Paper.rule },
  ruleDouble: { height: 4, borderTopWidth: 2, borderBottomWidth: 1, borderColor: Paper.rule },
  ruleThick: { height: 2, backgroundColor: Paper.rule, marginTop: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  title: {
    flex: 1,
    textAlign: 'center',
    fontFamily: serif,
    fontWeight: '900',
    color: Paper.ink,
    letterSpacing: 0.5,
  },
  turn: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: MIN_TOUCH / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Paper.ruleSoft,
  },
  turnOff: { opacity: 0.25 },
  turnPressed: { backgroundColor: Paper.paperEdge },
  turnText: { fontFamily: serif, fontSize: 26, lineHeight: 30, color: Paper.ink },
  dateLine: {
    fontFamily: serif,
    fontSize: 13,
    color: Paper.inkSoft,
    textAlign: 'center',
    paddingVertical: 4,
    fontStyle: 'italic',
  },
  sections: { gap: 16, paddingVertical: 8, paddingHorizontal: 2 },
  section: { minHeight: MIN_TOUCH, justifyContent: 'center' },
  sectionText: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: Paper.inkMuted },
  sectionOn: { color: Paper.accent },
  sectionBar: { height: 2, marginTop: 4, backgroundColor: 'transparent' },
  sectionBarOn: { backgroundColor: Paper.accent },
  empty: {
    fontFamily: serif,
    fontSize: 17,
    lineHeight: 25,
    color: Paper.inkSoft,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 28,
  },
  lead: { paddingTop: 10 },
  kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 6 },
  leadTitle: { fontFamily: serif, fontWeight: '800', color: Paper.ink },
  leadCause: { fontFamily: serif, fontSize: 16, lineHeight: 23, color: Paper.inkSoft, marginTop: 10 },
  byline: { fontSize: 12, color: Paper.inkMuted, marginTop: 6, fontStyle: 'italic' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -10 },
  story: {
    paddingHorizontal: 10,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Paper.ruleSoft,
  },
  storyDivider: { borderRightWidth: StyleSheet.hairlineWidth },
  storyTitle: { fontFamily: serif, fontSize: 19, lineHeight: 24, fontWeight: '700', color: Paper.ink },
  storyCause: { fontFamily: serif, fontSize: 14, lineHeight: 20, color: Paper.inkSoft, marginTop: 6 },
  boxes: { gap: 12, marginTop: 18 },
  boxesRow: { flexDirection: 'row', flexWrap: 'wrap' },
  box: {
    flexGrow: 1,
    flexBasis: 220,
    borderWidth: 1,
    borderColor: Paper.rule,
    padding: 12,
    gap: 4,
    backgroundColor: '#ece2cc',
  },
  boxTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4, color: Paper.accent, marginBottom: 4 },
  boxStrong: { fontFamily: serif, fontSize: 15, fontWeight: '700', color: Paper.ink },
  boxText: { fontFamily: serif, fontSize: 14, lineHeight: 20, color: Paper.ink },
  boxSmall: { fontSize: 12, color: Paper.inkMuted },
  bullet: { fontFamily: serif, fontSize: 14, lineHeight: 20, color: Paper.ink },
  footer: { fontSize: 11, color: Paper.inkMuted, textAlign: 'center', marginTop: 20, fontStyle: 'italic' },
});
